<?php

namespace App\Policies;

use App\Enums\MemberStatus;
use App\Enums\TripStatus;
use App\Models\Trip;
use App\Models\User;

class TripPolicy
{
    /**
     * Can the user view this trip?
     *
     * Visibility rules for Phase 2B:
     *   - owner can always view their trip
     *   - active member can view the trip
     *   - published trips are viewable by any authenticated user
     *
     * Phase 2C will introduce full public discovery. Until then, published
     * trips are visible to authenticated users only (not public/unauthenticated).
     */
    public function view(User $user, Trip $trip): bool
    {
        // Owner
        if ($trip->user_id === $user->id) {
            return true;
        }

        // Active member
        if ($trip->tripMembers()
            ->where('user_id', $user->id)
            ->where('status', MemberStatus::Active->value)
            ->exists()
        ) {
            return true;
        }

        // Published trips visible to authenticated users
        if ($trip->status === \App\Enums\TripStatus::Published) {
            return true;
        }

        return false;
    }

    /**
     * Only the trip owner may update.
     */
    public function update(User $user, Trip $trip): bool
    {
        return $trip->user_id === $user->id;
    }

    /**
     * Only the trip owner may publish.
     */
    public function publish(User $user, Trip $trip): bool
    {
        return $trip->user_id === $user->id;
    }

    /**
     * Only the trip owner may cancel.
     */
    public function cancel(User $user, Trip $trip): bool
    {
        return $trip->user_id === $user->id;
    }
}
