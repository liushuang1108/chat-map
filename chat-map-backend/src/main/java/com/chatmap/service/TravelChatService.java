package com.chatmap.service;

import com.chatmap.config.LlmProperties;
import com.chatmap.dto.AccommodationPoint;
import com.chatmap.dto.AttractionPoint;
import com.chatmap.dto.RouteInfo;
import com.chatmap.dto.TravelChatResponse;
import com.chatmap.dto.WeatherItem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Service
public class TravelChatService {

    private static final String SYSTEM_PROMPT =
            "你是中文旅游助手。用户会提出与行程、城市、时间相关的问题。\n"
                    + "你必须只输出一个 JSON 对象，不要 Markdown，不要代码块。字段如下：\n"
                    + "- reply: string，对用户问题的自然语言总结与建议（简短）。\n"
                    + "- weather: array，每项含 city, period（如\"行前\"\"行程中\"\"返程\"）, condition, temperatureC（整数或 null）。\n"
                    + "- clothingAdvice: string，着装建议。\n"
                    + "- attractions: array，游览景点（与住宿分开），数组顺序=建议游览先后顺序（第一个=第一站）。每项：name（具体地标名）, "
                    + "lng, lat（必须为 **WGS84 大地坐标** / EPSG:4326，与 GPS、OpenStreetMap、维基常用经纬度一致；"
                    + "勿使用高德/百度等火星坐标 GCJ-02 的数字）。可到小数点后 4～5 位。note, description（2～4 句）, imageUrl（https 或 \"\"）。\n"
                    + "- route: object，含 name（路线标题）, coordinates（可选，[lng,lat] 数组）。"
                    + "若填写 coordinates，须与 attractions 严格一致：第 1 个点必须等于 attractions[0] 的 lng/lat，"
                    + "且折线按 attractions 顺序依次经过每一处（可在相邻景点间增加中间拐点表示沿路走向）。\n"
                    + "- accommodations: array，住宿。每项：name, lng, lat（同上，**WGS84**）, note, description, imageUrl（无则 \"\"）。\n"
                    + "坐标准确性：先定城市与真实地名再填经纬度；粗略时在 reply 说明。attractions 与 accommodations 勿重复同一 POI。";

    private final LlmProperties llmProperties;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate = new RestTemplate();

    public TravelChatService(LlmProperties llmProperties, ObjectMapper objectMapper) {
        this.llmProperties = llmProperties;
        this.objectMapper = objectMapper;
    }

    public TravelChatResponse answer(String question) {
        if (!llmProperties.isConfigured()) {
            return demoResponse(question);
        }
        try {
            String rawJson = callLlm(question);
            return parseLlmJson(rawJson);
        } catch (Exception e) {
            return demoResponse("(模型调用失败，已返回演示数据) " + question);
        }
    }

    private String callLlm(String question) throws Exception {
        String body = objectMapper.createObjectNode()
                .put("model", llmProperties.getModel())
                .set("messages", objectMapper.createArrayNode()
                        .add(objectMapper.createObjectNode()
                                .put("role", "system")
                                .put("content", SYSTEM_PROMPT))
                        .add(objectMapper.createObjectNode()
                                .put("role", "user")
                                .put("content", question)))
                .toString();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(llmProperties.getApiKey().trim());

        HttpEntity<String> entity = new HttpEntity<>(body, headers);
        ResponseEntity<String> response = restTemplate.postForEntity(
                llmProperties.getBaseUrl().trim(),
                entity,
                String.class);

        if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
            throw new IllegalStateException("LLM HTTP " + response.getStatusCodeValue());
        }
        JsonNode root = objectMapper.readTree(response.getBody());
        JsonNode content = root.path("choices").path(0).path("message").path("content");
        if (content.isMissingNode() || !content.isTextual()) {
            throw new IllegalStateException("Unexpected LLM response shape");
        }
        String text = content.asText().trim();
        if (text.startsWith("```")) {
            text = text.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
        }
        return text;
    }

    private TravelChatResponse parseLlmJson(String json) throws Exception {
        JsonNode node = objectMapper.readTree(json);
        String reply = text(node, "reply");
        String clothing = text(node, "clothingAdvice");

        List<WeatherItem> weather = new ArrayList<WeatherItem>();
        if (node.path("weather").isArray()) {
            for (JsonNode w : node.path("weather")) {
                Integer temp = null;
                if (w.path("temperatureC").isNumber()) {
                    temp = w.path("temperatureC").intValue();
                }
                weather.add(new WeatherItem(
                        text(w, "city"),
                        text(w, "period"),
                        text(w, "condition"),
                        temp));
            }
        }

        RouteInfo route = null;
        JsonNode r = node.path("route");
        if (r.isObject()) {
            String name = text(r, "name");
            List<List<Double>> coords = new ArrayList<List<Double>>();
            if (r.path("coordinates").isArray()) {
                for (JsonNode pair : r.path("coordinates")) {
                    if (pair.isArray() && pair.size() >= 2) {
                        List<Double> p = new ArrayList<Double>();
                        p.add(pair.get(0).asDouble());
                        p.add(pair.get(1).asDouble());
                        coords.add(p);
                    }
                }
            }
            route = new RouteInfo(name, coords.isEmpty() ? null : coords);
        }

        List<AttractionPoint> attractions = new ArrayList<AttractionPoint>();
        if (node.path("attractions").isArray()) {
            for (JsonNode a : node.path("attractions")) {
                if (!a.path("lng").isNumber() || !a.path("lat").isNumber()) {
                    continue;
                }
                AttractionPoint p = new AttractionPoint();
                p.setName(text(a, "name"));
                p.setLng(a.path("lng").asDouble());
                p.setLat(a.path("lat").asDouble());
                p.setNote(text(a, "note"));
                p.setDescription(firstNonEmpty(text(a, "description"), text(a, "note")));
                p.setImageUrl(text(a, "imageUrl"));
                attractions.add(p);
            }
        }

        List<AccommodationPoint> accs = new ArrayList<AccommodationPoint>();
        if (node.path("accommodations").isArray()) {
            for (JsonNode a : node.path("accommodations")) {
                if (!a.path("lng").isNumber() || !a.path("lat").isNumber()) {
                    continue;
                }
                AccommodationPoint p = new AccommodationPoint();
                p.setName(text(a, "name"));
                p.setLng(a.path("lng").asDouble());
                p.setLat(a.path("lat").asDouble());
                p.setNote(text(a, "note"));
                p.setDescription(firstNonEmpty(text(a, "description"), text(a, "note")));
                p.setImageUrl(text(a, "imageUrl"));
                accs.add(p);
            }
        }

        TravelChatResponse out = new TravelChatResponse();
        out.setReply(reply);
        out.setWeather(weather);
        out.setClothingAdvice(clothing);
        out.setRoute(route);
        out.setAttractions(attractions);
        out.setAccommodations(accs);
        out.setDemo(false);
        alignRouteToAttractions(out);
        return out;
    }

    /**
     * 用 attractions 顺序生成路线折线，保证第一站=路线起点，且折线依次经过每个推荐景点。
     */
    private void alignRouteToAttractions(TravelChatResponse response) {
        List<AttractionPoint> atts = response.getAttractions();
        if (atts == null || atts.isEmpty()) {
            return;
        }
        List<List<Double>> computed = coordsFromAttractions(atts);
        if (computed == null) {
            return;
        }
        RouteInfo r = response.getRoute();
        String savedName = null;
        if (r != null && r.getName() != null && !r.getName().trim().isEmpty()) {
            savedName = r.getName().trim();
        }
        if (r == null) {
            r = new RouteInfo();
            response.setRoute(r);
        }
        r.setCoordinates(computed);
        r.setName(savedName != null ? savedName : "推荐游览路线");
    }

    private static List<List<Double>> coordsFromAttractions(List<AttractionPoint> atts) {
        List<List<Double>> coords = new ArrayList<List<Double>>();
        for (AttractionPoint a : atts) {
            coords.add(Arrays.asList(a.getLng(), a.getLat()));
        }
        if (coords.size() == 1) {
            List<Double> p0 = coords.get(0);
            coords.add(Arrays.asList(p0.get(0) + 0.0003, p0.get(1) + 0.0003));
        }
        return coords;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? "" : v.asText();
    }

    private static String firstNonEmpty(String a, String b) {
        if (a != null && !a.trim().isEmpty()) {
            return a;
        }
        return b != null ? b : "";
    }

    private TravelChatResponse demoResponse(String question) {
        List<WeatherItem> weather = Arrays.asList(
                new WeatherItem("北京", "行前", "晴，微风", 12),
                new WeatherItem("北京", "行程中", "多云", 18),
                new WeatherItem("北京", "返程", "晴", 16));
        String clothing = "春季昼夜温差大，建议洋葱式穿搭：薄外套、长袖与舒适步行鞋。";

        AttractionPoint ap1 = new AttractionPoint();
        ap1.setName("天安门广场");
        ap1.setLng(116.397755);
        ap1.setLat(39.903179);
        ap1.setNote("城市地标");
        ap1.setDescription("位于紫禁城以南，是世界上最大的城市广场之一，可看升旗与纪念碑。");
        ap1.setImageUrl(
                "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Tiananmen_Square.jpg/640px-Tiananmen_Square.jpg");

        AttractionPoint ap2 = new AttractionPoint();
        ap2.setName("故宫博物院");
        ap2.setLng(116.397026);
        ap2.setLat(39.918058);
        ap2.setNote("博物馆");
        ap2.setDescription("明清皇宫，建议提前预约门票，中轴线游览约半日。");
        ap2.setImageUrl(
                "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Forbidden_City_Beijing_panorama.jpg/640px-Forbidden_City_Beijing_panorama.jpg");

        List<AttractionPoint> attractions = Arrays.asList(ap1, ap2);

        AccommodationPoint h1 = new AccommodationPoint("示例酒店 · 王府井", 116.417854, 39.914200, "商圈");
        h1.setDescription("演示数据：位于王府井附近，购物与地铁方便。");
        h1.setImageUrl("");

        AccommodationPoint h2 = new AccommodationPoint("示例民宿 · 胡同", 116.395, 39.936, "安静");
        h2.setDescription("演示数据：胡同片区，体验老北京街巷。");
        h2.setImageUrl("");

        List<AccommodationPoint> accs = Arrays.asList(h1, h2);

        String reply = "（演示模式：请在 application.yml 配置 app.llm.base-url 与 app.llm.api-key 以启用真实大模型。）"
                + " 关于您的问题：「" + question + "」——可先参考下方天气、着装与地图上的路线、景点与住宿示意。";

        TravelChatResponse out = new TravelChatResponse();
        out.setReply(reply);
        out.setWeather(weather);
        out.setClothingAdvice(clothing);
        out.setRoute(new RouteInfo("示例：京城中轴一日", null));
        out.setAttractions(attractions);
        out.setAccommodations(accs);
        out.setDemo(true);
        alignRouteToAttractions(out);
        return out;
    }
}
