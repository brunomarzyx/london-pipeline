"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BoroughDetail } from "@/lib/db";

export default function Charts({ detail }: { detail: BoroughDetail }) {
  const prices = detail.priceSeries
    .filter((p) => p.price != null)
    .slice(-120)
    .map((p) => ({ month: p.month, price: p.price }));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">Average price over time</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={prices}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} minTickGap={40} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `£${Math.round(v / 1000)}k`} domain={["auto", "auto"]} />
              <Tooltip formatter={(v) => [`£${Number(v).toLocaleString()}`, "price"]} />
              <Line type="monotone" dataKey="price" stroke="#0284c7" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">Starts vs completions by financial year</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={detail.yearly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fy" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="starts" fill="#0284c7" name="Started" />
              <Bar dataKey="completions" fill="#94a3b8" name="Completed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
