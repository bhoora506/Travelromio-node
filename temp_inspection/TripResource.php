<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API representation of a Trip.
 *
 * Expects the following to be eager-loaded on the model:
 *   - owner          (BelongsTo User)
 *   - active_members_count (withCount)
 *
 * Pagination-friendly: does NOT re-run per-trip queries when used
 * in TripResource::collection() — counts are loaded via withCount().
 */
class TripResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        // Prefer pre-loaded count over re-running the query
        $activeMemberCount = $this->active_members_count
            ?? $this->activeMembers()->count();

        $remainingSlots = max(0, $this->max_members - $activeMemberCount);

        $membershipData = null;
        if ($user = $request->user()) {
            $membership = $this->relationLoaded('currentUserMembership') ? $this->currentUserMembership : null;
            $joinRequest = $this->relationLoaded('currentUserJoinRequest') ? $this->currentUserJoinRequest : null;

            $isOwner = $this->user_id === $user->id;
            
            if ($isOwner) {
                $membershipData = [
                    'is_owner'            => true,
                    'is_member'           => false,
                    'role'                => 'owner',
                    'status'              => 'active',
                    'joined_at'           => null,
                    'join_request_status' => null,
                ];
            } else {
                $isMember = $membership !== null && $membership->isActive();
                $membershipData = [
                    'is_owner'            => false,
                    'is_member'           => $isMember,
                    'role'                => $membership ? $membership->role?->value : null,
                    'status'              => $membership ? $membership->status?->value : null,
                    'joined_at'           => $membership ? $membership->joined_at : null,
                    'join_request_status' => $joinRequest ? $joinRequest->status?->value : null,
                ];
            }
        }

        return [
            'id'              => $this->id,
            'title'           => $this->title,
            'destination'     => $this->destination,
            'place_id'        => $this->place_id,
            'latitude'        => $this->latitude,
            'longitude'       => $this->longitude,
            'start_date'      => $this->start_date?->toDateString(),
            'end_date'        => $this->end_date?->toDateString(),
            'budget_min'      => $this->budget_min,
            'budget_max'      => $this->budget_max,
            'trip_type'       => $this->trip_type?->value,
            'description'     => $this->description,
            'max_members'     => $this->max_members,
            'status'          => $this->status?->value,
            'image_url'       => $this->image_path ? asset('storage/' . $this->image_path) : null,
            'owner'           => new TripOwnerResource($this->whenLoaded('owner')),
            'interests'       => InterestResource::collection($this->whenLoaded('interests')),
            'member_count'    => $activeMemberCount,
            'remaining_slots' => $remainingSlots,
            'membership'      => $this->when($membershipData !== null, $membershipData),
            'created_at'      => $this->created_at,
            'updated_at'      => $this->updated_at,
        ];
    }
}
