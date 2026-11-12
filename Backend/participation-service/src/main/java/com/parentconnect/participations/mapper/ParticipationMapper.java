package com.parentconnect.participations.mapper;

import com.parentconnect.participations.dto.ParticipantResponse;
import com.parentconnect.participations.dto.ParticipationResponse;
import com.parentconnect.participations.entity.Participation;
import org.springframework.stereotype.Component;

@Component
public class ParticipationMapper {

    public ParticipationResponse toResponse(Participation participation) {
        return new ParticipationResponse(
                participation.getId(),
                participation.getEventId(),
                participation.getUserId(),
                participation.getStatus(),
                participation.getJoinedAt(),
                participation.getCancelledAt(),
                participation.getCreatedAt(),
                participation.getUpdatedAt());
    }

    public ParticipantResponse toParticipant(Participation participation) {
        return new ParticipantResponse(participation.getId(), participation.getUserId(), participation.getJoinedAt());
    }
}
