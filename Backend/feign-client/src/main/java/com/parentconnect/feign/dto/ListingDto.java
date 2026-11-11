package com.parentconnect.feign.dto;

import java.util.Date;
import java.util.List;

public class ListingDto {
    private String id;
    private String title;
    private String description;
    private String category;
    private String condition;
    private String type; // DONATION, SALE, LENDING, EXCHANGE
    private String status; // AVAILABLE, RESERVED, BORROWED, CANCELLED
    private Double price;
    private String currency;
    private String ownerId;
    private String targetAgeRange;
    private List<String> images;
    private List<String> tags;
    private Date createdAt;
    private Date updatedAt;

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
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
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Double getPrice() { return price; }
    public void setPrice(Double price) { this.price = price; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getOwnerId() { return ownerId; }
    public void setOwnerId(String ownerId) { this.ownerId = ownerId; }
    public String getTargetAgeRange() { return targetAgeRange; }
    public void setTargetAgeRange(String targetAgeRange) { this.targetAgeRange = targetAgeRange; }
    public List<String> getImages() { return images; }
    public void setImages(List<String> images) { this.images = images; }
    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }
    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
    public Date getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Date updatedAt) { this.updatedAt = updatedAt; }
}
