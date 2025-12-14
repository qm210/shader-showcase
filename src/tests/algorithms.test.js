import {describe, it, expect} from "vitest";
import {totalSizeForStd140} from "../app/algorithms.js";

describe("OpenGL finesse", () => {

    it("std140 counting fits with monotonic sizes", async () => {
        const sizes = [1, 1, 4, 4];
        const target = totalSizeForStd140(sizes);
        expect(target).toBe(48);
    });

    it("std140 counting fits with nonmonotonic sizes", async () => {
        const sizes = [1, 2, 1, 4, 4];
        const target = totalSizeForStd140(sizes);
        expect(target).toBe(64);
    });

});
