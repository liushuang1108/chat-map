package com.chatmap.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class WeatherItem {

    private String city;
    private String period;
    private String condition;
    private Integer temperatureC;

    public WeatherItem() {
    }

    public WeatherItem(String city, String period, String condition, Integer temperatureC) {
        this.city = city;
        this.period = period;
        this.condition = condition;
        this.temperatureC = temperatureC;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getPeriod() {
        return period;
    }

    public void setPeriod(String period) {
        this.period = period;
    }

    public String getCondition() {
        return condition;
    }

    public void setCondition(String condition) {
        this.condition = condition;
    }

    public Integer getTemperatureC() {
        return temperatureC;
    }

    public void setTemperatureC(Integer temperatureC) {
        this.temperatureC = temperatureC;
    }
}
