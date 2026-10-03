<?php

namespace App\Http\Requests\Trip;

use App\Enums\TripStatus;
use App\Enums\TripType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTripRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Policy handles authorization
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'title'         => ['sometimes', 'string', 'min:3', 'max:200'],
            'destination'   => ['sometimes', 'string', 'max:200'],
            'place_id'      => ['sometimes', 'nullable', 'string', 'max:100'],
            'latitude'      => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'longitude'     => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
            'start_date'    => ['sometimes', 'date'],
            'end_date'      => ['sometimes', 'date', 'after_or_equal:start_date'],
            'budget_min'    => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'budget_max'    => ['sometimes', 'nullable', 'numeric', 'min:0', 'gte:budget_min'],
            'trip_type'     => ['sometimes', 'string', Rule::in(TripType::values())],
            'description'   => ['sometimes', 'nullable', 'string', 'max:5000'],
            'max_members'   => ['sometimes', 'integer', 'min:2', 'max:20'],
            // Trip interests — replaces the full interest list when provided (sync semantics)
            'interest_ids'   => ['sometimes', 'nullable', 'array', 'max:10'],
            'interest_ids.*' => ['integer', 'exists:interests,id'],
            'image'          => ['sometimes', 'nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120'],
            'remove_image'   => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'end_date.after_or_equal' => 'The end date must be on or after the start date.',
            'budget_max.gte'          => 'The maximum budget must be greater than or equal to the minimum budget.',
        ];
    }
}
