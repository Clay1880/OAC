import { describe, expect, it } from "vitest";
import { groupDefaulters } from "./defaulters";

const row = (orderId: string, studentId: string, paise: number, name = "Asha Rao") => ({
  id: orderId,
  total_paise: paise,
  student_id: studentId,
  profiles: { full_name: name, phone: "9876543210", reg_no: `R-${studentId}` },
});

describe("groupDefaulters", () => {
  it("adds up each student's unpaid orders and lists their order ids", () => {
    const groups = groupDefaulters([row("o1", "s1", 4500), row("o2", "s2", 2000, "Bela"), row("o3", "s1", 3000)]);

    expect(groups).toEqual([
      { studentId: "s1", name: "Asha Rao", phone: "9876543210", regNo: "R-s1", unpaidPaise: 7500, orderIds: ["o1", "o3"] },
      { studentId: "s2", name: "Bela", phone: "9876543210", regNo: "R-s2", unpaidPaise: 2000, orderIds: ["o2"] },
    ]);
  });

  it("puts the biggest debt first", () => {
    expect(groupDefaulters([row("o1", "s1", 100), row("o2", "s2", 900)]).map((g) => g.studentId)).toEqual(["s2", "s1"]);
  });

  it("copes with an embedded profile returned as a one-element array", () => {
    const wrapped = { ...row("o1", "s1", 100), profiles: [row("o1", "s1", 100).profiles] };
    expect(groupDefaulters([wrapped])[0].name).toBe("Asha Rao");
  });

  it("is empty with no unpaid orders", () => {
    expect(groupDefaulters([])).toEqual([]);
  });
});
