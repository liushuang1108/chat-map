package com.chatmap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class ChatMapApplication {

    public static void main(String[] args) {
        SpringApplication.run(ChatMapApplication.class, args);
    }
}
