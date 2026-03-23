package com.chatmap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.llm")
public class LlmProperties {

    /**
     * OpenAI-compatible chat completions URL, e.g. https://api.openai.com/v1/chat/completions
     */
    private String baseUrl = "";

    private String apiKey = "";

    private String model = "gpt-4o-mini";

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public boolean isConfigured() {
        return baseUrl != null && !baseUrl.trim().isEmpty()
                && apiKey != null && !apiKey.trim().isEmpty();
    }
}
