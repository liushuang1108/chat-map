package com.chatmap.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class TravelChatResponse {

    private String reply;
    private List<WeatherItem> weather;
    private String clothingAdvice;
    private RouteInfo route;
    private List<AttractionPoint> attractions;
    private List<AccommodationPoint> accommodations;
    private boolean demo;

    public TravelChatResponse() {
    }

    public TravelChatResponse(String reply, List<WeatherItem> weather, String clothingAdvice,
                              RouteInfo route, List<AccommodationPoint> accommodations, boolean demo) {
        this.reply = reply;
        this.weather = weather;
        this.clothingAdvice = clothingAdvice;
        this.route = route;
        this.accommodations = accommodations;
        this.demo = demo;
    }

    public String getReply() {
        return reply;
    }

    public void setReply(String reply) {
        this.reply = reply;
    }

    public List<WeatherItem> getWeather() {
        return weather;
    }

    public void setWeather(List<WeatherItem> weather) {
        this.weather = weather;
    }

    public String getClothingAdvice() {
        return clothingAdvice;
    }

    public void setClothingAdvice(String clothingAdvice) {
        this.clothingAdvice = clothingAdvice;
    }

    public RouteInfo getRoute() {
        return route;
    }

    public void setRoute(RouteInfo route) {
        this.route = route;
    }

    public List<AttractionPoint> getAttractions() {
        return attractions;
    }

    public void setAttractions(List<AttractionPoint> attractions) {
        this.attractions = attractions;
    }

    public List<AccommodationPoint> getAccommodations() {
        return accommodations;
    }

    public void setAccommodations(List<AccommodationPoint> accommodations) {
        this.accommodations = accommodations;
    }

    public boolean isDemo() {
        return demo;
    }

    public void setDemo(boolean demo) {
        this.demo = demo;
    }
}
