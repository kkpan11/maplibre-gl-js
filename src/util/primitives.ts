import {mat4, vec3, vec4} from 'gl-matrix';

export const enum IntersectionResult {
    None = 0,
    Partial = 1,
    Full = 2,
}

export class Frustum {

    constructor(public points: vec4[], public planes: vec4[]) { }

    public static fromInvProjectionMatrix(invProj: mat4, worldSize: number = 1, zoom: number = 0): Frustum {
        const clipSpaceCorners = [
            [-1, 1, -1, 1],
            [1, 1, -1, 1],
            [1, -1, -1, 1],
            [-1, -1, -1, 1],
            [-1, 1, 1, 1],
            [1, 1, 1, 1],
            [1, -1, 1, 1],
            [-1, -1, 1, 1]
        ];

        const scale = Math.pow(2, zoom);

        // Transform frustum corner points from clip space to tile space, Z to meters
        const frustumCoords = clipSpaceCorners.map(v => {
            v = vec4.transformMat4([] as any, v as any, invProj) as any;
            const s = 1.0 / v[3] / worldSize * scale;
            return vec4.mul(v as any, v as any, [s, s, 1.0 / v[3], s] as vec4);
        });

        const frustumPlanePointIndices = [
            [0, 1, 2],  // near
            [6, 5, 4],  // far
            [0, 3, 7],  // left
            [2, 1, 5],  // right
            [3, 2, 6],  // bottom
            [0, 4, 5]   // top
        ];

        const frustumPlanes = frustumPlanePointIndices.map((p: number[]) => {
            const a = vec3.sub([] as any, frustumCoords[p[0]] as vec3, frustumCoords[p[1]] as vec3);
            const b = vec3.sub([] as any, frustumCoords[p[2]] as vec3, frustumCoords[p[1]] as vec3);
            const n = vec3.normalize([] as any, vec3.cross([] as any, a, b)) as any;
            const d = -vec3.dot(n, frustumCoords[p[1]] as vec3);
            return n.concat(d);
        });

        return new Frustum(frustumCoords, frustumPlanes);
    }
}

export class Aabb {
    min: vec3;
    max: vec3;
    center: vec3;

    constructor(min_: vec3, max_: vec3) {
        this.min = min_;
        this.max = max_;
        this.center = vec3.scale([] as any, vec3.add([] as any, this.min, this.max), 0.5);
    }

    quadrant(index: number): Aabb {
        const split = [(index % 2) === 0, index < 2];
        const qMin = vec3.clone(this.min);
        const qMax = vec3.clone(this.max);
        for (let axis = 0; axis < split.length; axis++) {
            qMin[axis] = split[axis] ? this.min[axis] : this.center[axis];
            qMax[axis] = split[axis] ? this.center[axis] : this.max[axis];
        }
        // Elevation is always constant, hence quadrant.max.z = this.max.z
        qMax[2] = this.max[2];
        return new Aabb(qMin, qMax);
    }

    distanceX(point: Array<number>): number {
        const pointOnAabb = Math.max(Math.min(this.max[0], point[0]), this.min[0]);
        return pointOnAabb - point[0];
    }

    distanceY(point: Array<number>): number {
        const pointOnAabb = Math.max(Math.min(this.max[1], point[1]), this.min[1]);
        return pointOnAabb - point[1];
    }

    /**
     * Performs a frustum-aabb intersection test. Returns 0 if there's no intersection,
     * 1 if shapes are intersecting and 2 if the aabb if fully inside the frustum.
     */
    intersectsFrustum(frustum: Frustum): IntersectionResult {
        // Execute separating axis test between two convex objects to find intersections
        // Each frustum plane together with 3 major axes define the separating axes

        const aabbPoints: Array<vec4> = [
            [this.min[0], this.min[1], this.min[2], 1],
            [this.max[0], this.min[1], this.min[2], 1],
            [this.max[0], this.max[1], this.min[2], 1],
            [this.min[0], this.max[1], this.min[2], 1],
            [this.min[0], this.min[1], this.max[2], 1],
            [this.max[0], this.min[1], this.max[2], 1],
            [this.max[0], this.max[1], this.max[2], 1],
            [this.min[0], this.max[1], this.max[2], 1]
        ];

        let fullyInside = true;

        for (let p = 0; p < frustum.planes.length; p++) {
            const plane = frustum.planes[p];
            let pointsInside = 0;

            for (let i = 0; i < aabbPoints.length; i++) {
                if (vec4.dot(plane, aabbPoints[i]) >= 0) {
                    pointsInside++;
                }
            }

            if (pointsInside === 0)
                return IntersectionResult.None;

            if (pointsInside !== aabbPoints.length)
                fullyInside = false;
        }

        if (fullyInside)
            return IntersectionResult.Full;

        for (let axis = 0; axis < 3; axis++) {
            let projMin = Number.MAX_VALUE;
            let projMax = -Number.MAX_VALUE;

            for (let p = 0; p < frustum.points.length; p++) {
                const projectedPoint = frustum.points[p][axis] - this.min[axis];

                projMin = Math.min(projMin, projectedPoint);
                projMax = Math.max(projMax, projectedPoint);
            }

            if (projMax < 0 || projMin > this.max[axis] - this.min[axis])
                return IntersectionResult.None;
        }

        return IntersectionResult.Partial;
    }

    /**
     * Performs a halfspace-aabb intersection test. Returns 0 if there's no intersection,
     * 1 if shapes are intersecting and 2 if the aabb if fully inside the plane's positive halfspace.
     */
    intersectsPlane(plane: vec4): IntersectionResult {
        const aabbPoints: Array<vec4> = [
            [this.min[0], this.min[1], this.min[2], 1],
            [this.max[0], this.min[1], this.min[2], 1],
            [this.max[0], this.max[1], this.min[2], 1],
            [this.min[0], this.max[1], this.min[2], 1],
            [this.min[0], this.min[1], this.max[2], 1],
            [this.max[0], this.min[1], this.max[2], 1],
            [this.max[0], this.max[1], this.max[2], 1],
            [this.min[0], this.max[1], this.max[2], 1]
        ];

        let pointsInside = 0;
        for (let i = 0; i < aabbPoints.length; i++) {
            if (vec4.dot(plane, aabbPoints[i]) >= 0) {
                pointsInside++;
            }
        }

        if (pointsInside === 0) {
            return IntersectionResult.None;
        } else if (pointsInside < aabbPoints.length) {
            return IntersectionResult.Partial;
        } else {
            return IntersectionResult.Full;
        }
    }
}
