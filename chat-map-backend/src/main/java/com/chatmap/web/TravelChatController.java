package com.chatmap.web;

import com.chatmap.dto.TravelChatRequest;
import com.chatmap.dto.TravelChatResponse;
import com.chatmap.service.TravelChatService;
import javax.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/travel")
public class TravelChatController {

    private final TravelChatService travelChatService;

    public TravelChatController(TravelChatService travelChatService) {
        this.travelChatService = travelChatService;
    }

    @PostMapping(value = "/chat", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public TravelChatResponse chat(@Valid @RequestBody TravelChatRequest request) {
        return travelChatService.answer(request.getQuestion());
    }
}
