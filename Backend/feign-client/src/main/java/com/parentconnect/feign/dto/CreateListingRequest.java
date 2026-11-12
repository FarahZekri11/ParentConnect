package com.parentconnect.feign.dto;

import java.util.List;

public class CreateListingRequest {
    private String title;
    private String description;
    private String category;
    private String condition;
    private String type; // DONATION, SALE, LENDING, EXCHANGE
    private Double price;
    private String currency = "EUR";
    private String targetAgeRange;
    private List<String> images;
    private List<String> tags;

    public CreateListingRequest() {}

    public CreateListingRequest(String title, String description, String category, String condition, String type, Double price) {
        this.title = title;
        this.description = description;
        this.category = category;
        this.condition = condition;
        this.type = type;
        this.price = price;
    }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getCondition() { return condition; }
    public void setCondition(String condition) { this.condition = condition; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public Double getPrice() { return price; }
    public void setPrice(Double price) { this.price = price; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getTargetAgeRange() { return targetAgeRange; }
    public void setTargetAgeRange(String targetAgeRange) { this.targetAgeRange = targetAgeRange; }
    public List<String> getImages() { return images; }
    public void setImages(List<String> images) { this.images = images; }
    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }
}
