import {describe, it, expect} from "vitest";
import {binarySearchLeft, binarySearchRight, totalSizeForStd140} from "../app/algorithms.js";

describe("Binary Search", () => {

    it("R works for first of two elements", () => {
        const array = [{time: 0}, {time: 9}];
        const target = binarySearchRight(0, array, "time");
        expect(target).toBe(0);
    });

    it("R works for second of two elements", () => {
        const array = [{time: 0}, {time: 9}];
        const target = binarySearchRight(9, array, "time");
        expect(target).toBe(1);
    });

    it("R works between two elements", () => {
        const array = [{time: 0}, {time: 9}];
        const target = binarySearchRight(3, array, "time");
        expect(target).toBe(1);
    });

    it("R works for some case of more elements", () => {
        const array = [{time: 0}, {time: 2}, {time: 9}];
        const target = binarySearchRight(3, array, "time");
        expect(target).toBe(2);
    });

    it("L works for first of two elements", () => {
        const array = [{time: 0}, {time: 9}];
        const target = binarySearchLeft(0, array, "time");
        expect(target).toBe(0);
    });

    it("L works for second of two elements", () => {
        const array = [{time: 0}, {time: 9}];
        const target = binarySearchLeft(9, array, "time");
        expect(target).toBe(1);
    });

    it("L works between two elements", () => {
        const array = [{time: 0}, {time: 9}];
        const target = binarySearchLeft(3, array, "time");
        expect(target).toBe(0);
    });
});

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
