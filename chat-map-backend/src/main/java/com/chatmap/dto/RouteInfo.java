package com.chatmap.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class RouteInfo {

    private String name;
    /** WGS84: [longitude, latitude] as nested lists for JSON */
    private List<List<Double>> coordinates;

    public RouteInfo() {
    }

    public RouteInfo(String name, List<List<Double>> coordinates) {
        this.name = name;
        this.coordinates = coordinates;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public List<List<Double>> getCoordinates() {
        return coordinates;
    }

    public void setCoordinates(List<List<Double>> coordinates) {
        this.coordinates = coordinates;
    }
}
