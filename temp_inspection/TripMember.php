<?php

namespace App\Models;

use App\Enums\MemberRole;
use App\Enums\MemberStatus;
use Database\Factories\TripMemberFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TripMember model.
 *
 * Represents confirmed membership of a user in a trip.
 *
 * One-owner invariant
 * ───────────────────
 * Only one row per trip should have role = 'owner'.
 * This invariant is enforced at the application layer (Phase 2B TripService),
 * not at the DB level, because MySQL/SQLite partial-unique constraints differ.
 *
 * Request/invitation workflow
 * ───────────────────────────
 * trip_members stores CONFIRMED memberships only.
 * The pending/accepted/rejected request states live in trip_requests
 * (Phase 4 — Connections). Do not add request-workflow states here.
 */
#[Fillable(['trip_id', 'user_id', 'role', 'status', 'joined_at'])]
class TripMember extends Model
{
    /** @use HasFactory<TripMemberFactory> */
    use HasFactory;

    /**
     * @return array<string, mixed>
     */
    protected function casts(): array
    {
        return [
            'role'      => MemberRole::class,
            'status'    => MemberStatus::class,
            'joined_at' => 'datetime',
        ];
    }

    // ── Relationships ──────────────────────────────────────────────────────────

    public function trip(): BelongsTo
    {
        return $this->belongsTo(Trip::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    public function isOwner(): bool
    {
        return $this->role === MemberRole::Owner;
    }

    public function isActive(): bool
    {
        return $this->status === MemberStatus::Active;
    }
}
