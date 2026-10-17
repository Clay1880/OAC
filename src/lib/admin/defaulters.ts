type Profile = { full_name: string; phone: string | null; reg_no: string | null };

/** An unpaid no-show order with its student's profile, as the admin query returns it. */
export type UnpaidOrderRow = {
  id: string;
  total_paise: number;
  student_id: string;
  profiles: Profile | Profile[] | null;
};

export type Defaulter = {
  studentId: string;
  name: string;
  phone: string | null;
  regNo: string | null;
  unpaidPaise: number;
  orderIds: string[];
};

/** One entry per student with what they owe in total and which orders make it up, biggest debt first. */
export function groupDefaulters(rows: UnpaidOrderRow[]): Defaulter[] {
  const byStudent = new Map<string, Defaulter>();
  for (const row of rows) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const entry = byStudent.get(row.student_id) ?? {
      studentId: row.student_id,
      name: profile?.full_name ?? "Unknown student",
      phone: profile?.phone ?? null,
      regNo: profile?.reg_no ?? null,
      unpaidPaise: 0,
      orderIds: [],
    };
    entry.unpaidPaise += row.total_paise;
    entry.orderIds.push(row.id);
    byStudent.set(row.student_id, entry);
  }
  return [...byStudent.values()].sort((a, b) => b.unpaidPaise - a.unpaidPaise);
}
