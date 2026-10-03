<?php

namespace App\Enums;

/**
 * Trip lifecycle states.
 *
 * Allowed transitions:
 *   draft      → published | cancelled
 *   published  → ongoing | cancelled
 *   ongoing    → completed | cancelled
 *   completed  → (terminal)
 *   cancelled  → (terminal)
 *
 * The transition rules are enforced at the service/controller layer in Phase 2B.
 * The schema stores the current state as a string. Casted to this enum on the model.
 */
enum TripStatus: string
{
    case Draft     = 'draft';
    case Published = 'published';
    case Ongoing   = 'ongoing';
    case Completed = 'completed';
    case Cancelled = 'cancelled';

    /**
     * Return all case values as a plain array for validation rules.
     *
     * @return string[]
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * States from which a trip may be cancelled.
     *
     * @return TripStatus[]
     */
    public static function cancellableFrom(): array
    {
        return [self::Draft, self::Published, self::Ongoing];
    }

    /**
     * Returns true if this state is a terminal state (no further transitions allowed).
     */
    public function isTerminal(): bool
    {
        return match ($this) {
            self::Completed, self::Cancelled => true,
            default                          => false,
        };
    }

    /**
     * Returns the allowed next states from the current state.
     *
     * @return TripStatus[]
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Draft     => [self::Published, self::Cancelled],
            self::Published => [self::Ongoing, self::Cancelled],
            self::Ongoing   => [self::Completed, self::Cancelled],
            default         => [],
        };
    }

    /**
     * Returns true if transitioning to $next is valid from the current state.
     */
    public function canTransitionTo(self $next): bool
    {
        return in_array($next, $this->allowedTransitions(), strict: true);
    }
}
