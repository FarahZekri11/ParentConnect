package com.parentconnect.feign.dto;

import java.util.List;

public class ListingsResponse {
    private List<ListingDto> listings;
    private int total;
    private int page;
    private int limit;
    private int totalPages;

    public List<ListingDto> getListings() { return listings; }
    public void setListings(List<ListingDto> listings) { this.listings = listings; }
    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }
    public int getPage() { return page; }
    public void setPage(int page) { this.page = page; }
    public int getLimit() { return limit; }
    public void setLimit(int limit) { this.limit = limit; }
    public int getTotalPages() { return totalPages; }
    public void setTotalPages(int totalPages) { this.totalPages = totalPages; }
}
