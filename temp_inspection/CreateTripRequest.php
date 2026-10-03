<?php

namespace App\Http\Requests\Trip;

use App\Enums\TripType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateTripRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // auth:sanctum middleware handles authentication; Policy handles ownership
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'title'         => ['required', 'string', 'min:3', 'max:200'],
            'destination'   => ['required', 'string', 'max:200'],
            'place_id'      => ['nullable', 'string', 'max:100'],
            'latitude'      => ['nullable', 'numeric', 'between:-90,90'],
            'longitude'     => ['nullable', 'numeric', 'between:-180,180'],
            'start_date'    => ['required', 'date', 'after_or_equal:today'],
            'end_date'      => ['required', 'date', 'after_or_equal:start_date'],
            'budget_min'    => ['nullable', 'numeric', 'min:0'],
            'budget_max'    => ['nullable', 'numeric', 'min:0', 'gte:budget_min'],
            'trip_type'     => ['required', 'string', Rule::in(TripType::values())],
            'description'   => ['nullable', 'string', 'max:5000'],
            'max_members'   => ['required', 'integer', 'min:2', 'max:20'],
            // Trip interests — optional on create; IDs must exist in the interests table
            'interest_ids'   => ['sometimes', 'nullable', 'array', 'max:10'],
            'interest_ids.*' => ['integer', 'exists:interests,id'],
            'image'          => ['nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'end_date.after_or_equal'  => 'The end date must be on or after the start date.',
            'budget_max.gte'           => 'The maximum budget must be greater than or equal to the minimum budget.',
            'start_date.after_or_equal' => 'The start date must be today or in the future.',
        ];
    }
}
