<?php

namespace App\Enums;

enum TripType: string
{
    case Weekend      = 'weekend';
    case Adventure    = 'adventure';
    case Backpacking  = 'backpacking';
    case RoadTrip     = 'road_trip';
    case Nature       = 'nature';
    case Photography  = 'photography';
    case Cultural     = 'cultural';
    case Beach        = 'beach';
    case Mountains    = 'mountains';
    case Other        = 'other';

    /**
     * Return all case values as a plain array for validation rules.
     *
     * @return string[]
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
