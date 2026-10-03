<?php

namespace App\Http\Controllers;

use App\Http\Requests\Trip\CreateTripRequest;
use App\Http\Requests\Trip\TripDiscoveryRequest;
use App\Http\Requests\Trip\UpdateTripRequest;
use App\Http\Resources\TripResource;
use App\Models\Trip;
use App\Services\TripDiscoveryService;
use App\Services\TripService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class TripController extends Controller
{
    use ApiResponse;

    public function __construct(
        private readonly TripService $tripService,
        private readonly TripDiscoveryService $discoveryService,
    ) {
    }

    /**
     * Trip discovery — paginated feed of published trips.
     * Excludes the authenticated user's own trips.
     * GET /api/trips
     */
    public function index(TripDiscoveryRequest $request): JsonResponse
    {
        $trips = $this->discoveryService->discover(
            authenticatedUserId: $request->user()->id,
            filters: $request->validated(),
        );

        return $this->successResponse(
            data: [
                'items'      => TripResource::collection($trips->items()),
                'pagination' => [
                    'total'        => $trips->total(),
                    'per_page'     => $trips->perPage(),
                    'current_page' => $trips->currentPage(),
                    'last_page'    => $trips->lastPage(),
                    'has_more'     => $trips->hasMorePages(),
                ],
            ],
            message: 'Trips retrieved successfully.',
        );
    }

    /**
     * Create a new trip. Owner membership is created atomically.
     * POST /api/trips
     */
    public function store(CreateTripRequest $request): JsonResponse
    {
        $trip = $this->tripService->createTrip(
            owner: $request->user(),
            data:  $request->validated(),
        );

        $trip->load('owner', 'interests', 'currentUserMembership', 'currentUserJoinRequest');
        $trip->loadCount(['tripMembers as active_members_count' => fn ($q) => $q->where('status', 'active')]);

        return $this->successResponse(
            data:    ['trip' => new TripResource($trip)],
            message: 'Trip created successfully.',
            status:  201,
        );
    }

    /**
     * View a trip.
     * GET /api/trips/{trip}
     */
    public function show(Request $request, Trip $trip): JsonResponse
    {
        $this->authorize('view', $trip);

        $trip->load('owner', 'interests', 'currentUserMembership', 'currentUserJoinRequest');
        $trip->loadCount(['tripMembers as active_members_count' => fn ($q) => $q->where('status', 'active')]);

        return $this->successResponse(
            data:    ['trip' => new TripResource($trip)],
            message: 'Trip retrieved successfully.',
        );
    }

    /**
     * Update a trip (owner only, lifecycle-restricted).
     * PUT /api/trips/{trip}
     */
    public function update(UpdateTripRequest $request, Trip $trip): JsonResponse
    {
        $this->authorize('update', $trip);

        $trip = $this->tripService->updateTrip($trip, $request->validated());

        $trip->load('owner', 'interests', 'currentUserMembership', 'currentUserJoinRequest');
        $trip->loadCount(['tripMembers as active_members_count' => fn ($q) => $q->where('status', 'active')]);

        return $this->successResponse(
            data:    ['trip' => new TripResource($trip)],
            message: 'Trip updated successfully.',
        );
    }

    /**
     * List the authenticated user's own trips (paginated).
     * GET /api/my/trips
     */
    public function myTrips(Request $request): JsonResponse
    {
        $trips = $request->user()
            ->trips()
            ->with('owner', 'interests', 'currentUserMembership', 'currentUserJoinRequest')
            ->withCount(['tripMembers as active_members_count' => fn ($q) => $q->where('status', 'active')])
            ->latest()
            ->paginate(15);

        return $this->successResponse(
            data: [
                'items'      => TripResource::collection($trips->items()),
                'pagination' => [
                    'total'        => $trips->total(),
                    'per_page'     => $trips->perPage(),
                    'current_page' => $trips->currentPage(),
                    'last_page'    => $trips->lastPage(),
                    'has_more'     => $trips->hasMorePages(),
                ],
            ],
            message: 'Trips retrieved successfully.',
        );
    }

    /**
     * List the authenticated user's joined trips (non-owner).
     * GET /api/my/joined-trips
     */
    public function joinedTrips(Request $request): JsonResponse
    {
        $trips = $request->user()
            ->tripsJoined()
            ->wherePivot('role', \App\Enums\MemberRole::Member->value)
            ->wherePivot('status', \App\Enums\MemberStatus::Active->value)
            ->with('owner', 'interests', 'currentUserMembership', 'currentUserJoinRequest')
            ->withCount(['tripMembers as active_members_count' => fn ($q) => $q->where('status', 'active')])
            ->latest()
            ->paginate(15);

        return $this->successResponse(
            data: [
                'items'      => TripResource::collection($trips->items()),
                'pagination' => [
                    'total'        => $trips->total(),
                    'per_page'     => $trips->perPage(),
                    'current_page' => $trips->currentPage(),
                    'last_page'    => $trips->lastPage(),
                    'has_more'     => $trips->hasMorePages(),
                ],
            ],
            message: 'Joined trips retrieved successfully.',
        );
    }

    /**
     * Publish a draft trip (owner only).
     * POST /api/trips/{trip}/publish
     */
    public function publish(Request $request, Trip $trip): JsonResponse
    {
        $this->authorize('publish', $trip);

        $trip = $this->tripService->publishTrip($trip);

        $trip->load('owner', 'interests', 'currentUserMembership', 'currentUserJoinRequest');
        $trip->loadCount(['tripMembers as active_members_count' => fn ($q) => $q->where('status', 'active')]);

        return $this->successResponse(
            data:    ['trip' => new TripResource($trip)],
            message: 'Trip published successfully.',
        );
    }

    /**
     * Cancel a trip (owner only, non-terminal states only).
     * POST /api/trips/{trip}/cancel
     */
    public function cancel(Request $request, Trip $trip): JsonResponse
    {
        $this->authorize('cancel', $trip);

        $trip = $this->tripService->cancelTrip($trip);

        $trip->load('owner', 'interests', 'currentUserMembership', 'currentUserJoinRequest');
        $trip->loadCount(['tripMembers as active_members_count' => fn ($q) => $q->where('status', 'active')]);

        return $this->successResponse(
            data:    ['trip' => new TripResource($trip)],
            message: 'Trip cancelled successfully.',
        );
    }
}
