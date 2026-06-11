'use client';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, api } from '@/lib/api';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import {
    TrendingUp, Receipt, FileText,
    Download, Users, Calendar, Hotel,
    ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';

// ─── CSV download ──────────────────────────────────────────────────────────────
function downloadCsv(rows: Record<string, any>[], filename: string) {
    if (!rows?.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
        headers.join(','),
        ...rows.map((r) =>
            headers.map((h) => JSON.stringify(r[h] ?? '')).join(','),
        ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// ─── GSTR-1 JSON download ──────────────────────────────────────────────────────
async function downloadGstr1(from: string, to: string) {
    try {
        const res = await api.get(
            `/api/v1/hotel/reports/gstr1-export?from=${from}&to=${to}`,
            { responseType: 'blob' },
        );
        const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `GSTR1_${from}_${to}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err: any) {
        console.error('GSTR-1 export error:', err);
        alert(err?.response?.data?.message || 'GSTR-1 export failed. Check console for details.');
    }
}

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#6b7280'];

type HotelReportTab = 'revenue' | 'bookings' | 'rooms' | 'payments' | 'gst' | 'frontdesk';

const TABS = [
    { id: 'revenue', label: 'Revenue', icon: TrendingUp },
    { id: 'bookings', label: 'Bookings', icon: Calendar },
    { id: 'rooms', label: 'Rooms', icon: Hotel },
    { id: 'payments', label: 'Payments', icon: Receipt },
    { id: 'gst', label: 'GST Report', icon: FileText },
    { id: 'frontdesk', label: 'Front Desk', icon: Users },
] as const;

export default function HotelReportsPage() {
    const [tab, setTab] = useState<HotelReportTab>('revenue');
    const [from, setFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
    const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
    const [expandedBooking, setExpandedBooking] = useState<string | null>(null);

    // ── Queries with isLoading ──────────────────────────────────────────────────
    const { data: revenueReport, isLoading: revenueLoading } = useQuery({
        queryKey: ['hotel-revenue', from, to],
        queryFn: () => apiFetch(`/api/v1/hotel/reports/revenue?from=${from}&to=${to}`).then((r) => r.data),
        enabled: tab === 'revenue',
    });

    const { data: bookingsReport, isLoading: bookingsLoading } = useQuery({
        queryKey: ['hotel-bookings', from, to],
        queryFn: () => apiFetch(`/api/v1/hotel/reports/bookings?from=${from}&to=${to}`).then((r) => r.data),
        enabled: tab === 'bookings',
    });

    const { data: roomsReport, isLoading: roomsLoading } = useQuery({
        queryKey: ['hotel-rooms', from, to],
        queryFn: () => apiFetch(`/api/v1/hotel/reports/rooms?from=${from}&to=${to}`).then((r) => r.data),
        enabled: tab === 'rooms',
    });

    const { data: occupancySummary, isLoading: occupancyLoading } = useQuery({
        queryKey: ['hotel-occupancy-summary'],
        queryFn: () => apiFetch('/api/v1/hotel/reports/occupancy-summary').then((r) => r.data),
        enabled: tab === 'rooms',
    });

    const { data: payments, isLoading: paymentsLoading } = useQuery({
        queryKey: ['hotel-payments', from, to],
        queryFn: () => apiFetch(`/api/v1/hotel/reports/payments?from=${from}&to=${to}`).then((r) => r.data),
        enabled: tab === 'payments',
    });

    const { data: gstReport, isLoading: gstLoading } = useQuery({
        queryKey: ['hotel-gst', from, to],
        queryFn: () => apiFetch(`/api/v1/hotel/reports/gst?from=${from}&to=${to}`).then((r) => r.data),
        enabled: tab === 'gst',
    });

    const { data: frontdeskReport, isLoading: frontdeskLoading } = useQuery({
        queryKey: ['hotel-frontdesk', from, to],
        queryFn: () => apiFetch(`/api/v1/hotel/reports/frontdesk?from=${from}&to=${to}`).then((r) => r.data),
        enabled: tab === 'frontdesk',
    });

    // ── Global loading state ────────────────────────────────────────────────────
    const loading =
        revenueLoading ||
        bookingsLoading ||
        roomsLoading ||
        occupancyLoading ||
        paymentsLoading ||
        gstLoading ||
        frontdeskLoading;

    // ── Summary totals ────────────────────────────────────────────────────────────
    const totalRevenue = revenueReport?.reduce((s: number, d: any) => s + Number(d.revenue || 0), 0) || 0;
    const totalBookings = revenueReport?.reduce((s: number, d: any) => s + Number(d.bookings || 0), 0) || 0;
    const totalTax = revenueReport?.reduce((s: number, d: any) => s + Number(d.tax || 0), 0) || 0;

    // Calculate average occupancy safely
    const totalOccupancy = roomsReport?.reduce((s: number, r: any) => s + Number(r.occupancy || 0), 0) || 0;
    const avgOccupancy = roomsReport?.length
        ? Math.round(totalOccupancy / roomsReport.length)
        : 0;

    // ── Export handler ────────────────────────────────────────────────────────────
    const handleExport = () => {
        if (tab === 'revenue' && revenueReport) downloadCsv(revenueReport, `hotel-revenue-${from}-${to}.csv`);
        if (tab === 'bookings' && bookingsReport) downloadCsv(bookingsReport, `hotel-bookings-${from}-${to}.csv`);
        if (tab === 'rooms' && roomsReport) downloadCsv(roomsReport, `hotel-rooms-${from}-${to}.csv`);
        if (tab === 'payments' && payments) downloadCsv(payments, `hotel-payments-${from}-${to}.csv`);
        if (tab === 'gst' && gstReport) downloadCsv(gstReport, `hotel-gst-${from}-${to}.csv`);
        if (tab === 'frontdesk' && frontdeskReport) downloadCsv(frontdeskReport, `hotel-frontdesk-${from}-${to}.csv`);
    };

    const fmt = (n: number) =>
        `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Helper for occupancy color
    const getOccupancyColor = (percentage: number) => {
        if (percentage >= 80) return 'text-emerald-600 dark:text-emerald-400';
        if (percentage >= 60) return 'text-amber-600 dark:text-amber-400';
        return 'text-red-600 dark:text-red-400';
    };

    // Helper for booking status color
    const getStatusColor = (status: string) => {
        const statusMap: Record<string, string> = {
            checked_in: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
            checked_out: 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400',
            confirmed: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
            cancelled: 'bg-red-500/20 text-red-600 dark:text-red-400',
        };
        return statusMap[status] || 'bg-gray-500/20 text-gray-600 dark:text-gray-400';
    };

    return (
        <div className="p-6 space-y-6">

            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Hotel Reports & Analytics</h1>
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-900 dark:text-slate-400">From</span>
                        <input type="date" className="input py-1.5" value={from}
                            onChange={(e) => setFrom(e.target.value)} max={to} />
                        <span className="text-slate-900 dark:text-slate-400">To</span>
                        <input type="date" className="input py-1.5" value={to}
                            onChange={(e) => setTo(e.target.value)}
                            min={from} max={dayjs().format('YYYY-MM-DD')} />
                    </div>
                    <button onClick={handleExport} className="btn-secondary text-sm">
                        <Download size={13} /> Export CSV
                    </button>
                    {tab === 'gst' && (
                        <button
                            onClick={() => downloadGstr1(from, to)}
                            className="btn-secondary text-sm"
                        >
                            <Download size={13} /> GSTR-1 JSON
                        </button>
                    )}
                </div>
            </div>

            {/* ── Tabs ───────────────────────────────────────────────────────────── */}
            <div className="flex gap-1 bg-slate-50 dark:bg-slate-800 rounded-lg p-1 flex-wrap">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setTab(id as HotelReportTab)}
                        className={cn(
                            'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                            tab === id ? 'bg-amber-500 text-slate-900' : 'text-slate-900 dark:text-slate-400 hover:text-slate-900 dark:text-white',
                        )}
                    >
                        <Icon size={14} /> {label}
                    </button>
                ))}
            </div>

            {/* ── Global Loader ────────────────────────────────────────────────────── */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Loading report...
                        </p>
                    </div>
                </div>
            )}

            {/* ════════ REVENUE TAB ════════ */}
            {!loading && tab === 'revenue' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'Total Bookings', value: totalBookings.toLocaleString('en-IN') },
                            { label: 'Total Revenue', value: fmt(totalRevenue) },
                            { label: 'Total Tax', value: fmt(totalTax) },
                            { label: 'Net Revenue', value: fmt(totalRevenue - totalTax) },
                        ].map(({ label, value }) => (
                            <div key={label} className="stat-card">
                                <div className="stat-label">{label}</div>
                                <div className="stat-value text-xl">{value}</div>
                            </div>
                        ))}
                    </div>

                    <div className="card">
                        <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Daily Revenue Trend</h2>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={revenueReport?.map((d: any) => ({
                                date: dayjs(d.date).format('D MMM'),
                                bookings: Number(d.bookings),
                                revenue: Number(d.revenue),
                                netRevenue: Number(d.net_revenue),
                            })) || []}>
                                <XAxis dataKey="date" tick={{ fill: 'var(--chart-axis-text)', fontSize: 11 }} />
                                <YAxis tick={{ fill: 'var(--chart-axis-text)', fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                                <Tooltip
                                    contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, color: 'var(--chart-tooltip-text)' }}
                                    formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`}
                                />
                                <Line type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} name="Revenue" />
                                <Line type="monotone" dataKey="netRevenue" stroke="#10b981" strokeWidth={2} name="Net Revenue" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="card p-0 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100/50 dark:bg-slate-800/50">
                                <tr>
                                    <th className="th">Date</th>
                                    <th className="th text-right">Bookings</th>
                                    <th className="th text-right">Revenue</th>
                                    <th className="th text-right">Tax</th>
                                    <th className="th text-right">Net Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {revenueReport?.map((d: any) => (
                                    <tr key={d.date} className="table-row">
                                        <td className="td">{dayjs(d.date).format('D MMM YYYY')}</td>
                                        <td className="td text-right">{d.bookings}</td>
                                        <td className="td text-right font-medium text-amber-600 dark:text-amber-400">
                                            {fmt(Number(d.revenue))}
                                        </td>
                                        <td className="td text-right text-slate-900 dark:text-slate-400">
                                            {fmt(Number(d.tax))}
                                        </td>
                                        <td className="td text-right font-bold">
                                            {fmt(Number(d.net_revenue))}
                                        </td>
                                    </tr>
                                ))}
                                {!revenueReport?.length && (
                                    <tr>
                                        <td colSpan={5} className="td text-center text-slate-900 dark:text-slate-500 py-8">
                                            No data for selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ════════ BOOKINGS TAB ════════ */}
            {!loading && tab === 'bookings' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'Total Bookings', value: bookingsReport?.length || 0 },
                            {
                                label: 'Total Amount',
                                value: fmt(bookingsReport?.reduce((s: number, b: any) => s + Number(b.amount || 0), 0) || 0)
                            },
                            {
                                label: 'Checked In',
                                value: bookingsReport?.filter((b: any) => b.status === 'checked_in').length || 0
                            },
                            {
                                label: 'Checked Out',
                                value: bookingsReport?.filter((b: any) => b.status === 'checked_out').length || 0
                            },
                        ].map(({ label, value }) => (
                            <div key={label} className="stat-card">
                                <div className="stat-label">{label}</div>
                                <div className="stat-value text-xl">{value}</div>
                            </div>
                        ))}
                    </div>

                    <div className="card p-0 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100/50 dark:bg-slate-800/50">
                                <tr>
                                    <th className="th">Booking ID</th>
                                    <th className="th">Guest Name</th>
                                    <th className="th">Check In</th>
                                    <th className="th">Check Out</th>
                                    <th className="th">Room</th>
                                    <th className="th">Status</th>
                                    <th className="th text-right">Amount</th>
                                    <th className="th"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {bookingsReport?.map((booking: any) => (
                                    <React.Fragment key={booking.booking_id}>
                                        <tr
                                            className="table-row cursor-pointer"
                                            onClick={() => setExpandedBooking(
                                                expandedBooking === booking.booking_id ? null : booking.booking_id,
                                            )}
                                        >
                                            <td className="td font-mono text-xs">
                                                {booking.booking_ref
                                                    ? <span className="text-amber-600 dark:text-amber-400 font-semibold">{booking.booking_ref}</span>
                                                    : <span className="text-slate-500">#{(booking.booking_id || '').slice(0, 8).toUpperCase()}</span>}
                                            </td>
                                            <td className="td font-medium">{booking.guest_name || '—'}</td>
                                            <td className="td">{dayjs(booking.check_in).format('DD MMM YYYY')}</td>
                                            <td className="td">{dayjs(booking.check_out).format('DD MMM YYYY')}</td>
                                            <td className="td">{booking.room_number || '—'}</td>
                                            <td className="td">
                                                <span className={cn(
                                                    'text-xs px-2 py-0.5 rounded-full font-medium',
                                                    getStatusColor(booking.status || 'unknown')
                                                )}>
                                                    {(booking.status || 'unknown').replace('_', ' ').toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="td text-right font-bold text-amber-600 dark:text-amber-400">
                                                {fmt(Number(booking.amount))}
                                            </td>
                                            <td className="td">
                                                {expandedBooking === booking.booking_id
                                                    ? <ChevronUp size={14} />
                                                    : <ChevronDown size={14} />}
                                            </td>
                                        </tr>

                                        {expandedBooking === booking.booking_id && (
                                            <tr className="bg-slate-50 dark:bg-slate-800/30">
                                                <td colSpan={8} className="px-6 py-4">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                                                        <div>
                                                            <div className="text-slate-900 dark:text-slate-500 text-xs mb-1">Guest Email</div>
                                                            <div className="font-medium">{booking.guest_email || '—'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-slate-900 dark:text-slate-500 text-xs mb-1">Phone</div>
                                                            <div className="font-medium">{booking.guest_phone || '—'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-slate-900 dark:text-slate-500 text-xs mb-1">Nights</div>
                                                            <div className="font-medium">{booking.nights || 0} nights</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-slate-900 dark:text-slate-500 text-xs mb-1">Payment Status</div>
                                                            <div className="font-medium">{booking.payment_status || '—'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                                {!bookingsReport?.length && (
                                    <tr>
                                        <td colSpan={8} className="td text-center text-slate-900 dark:text-slate-500 py-8">
                                            No bookings for selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ════════ ROOMS PERFORMANCE TAB ════════ */}
            {!loading && tab === 'rooms' && (
                <div className="space-y-4">
                    {/* Occupancy Summary Card - Most Important for Hotel Owners */}
                    {occupancySummary && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: 'Occupancy Today', value: `${occupancySummary.occupancy_today || 0}%`, color: 'text-emerald-600' },
                                { label: 'Available Rooms', value: occupancySummary.available_rooms || 0, color: 'text-blue-600' },
                                { label: 'Occupied Rooms', value: occupancySummary.occupied_rooms || 0, color: 'text-amber-600' },
                                { label: 'Maintenance Rooms', value: occupancySummary.maintenance_rooms || 0, color: 'text-red-600' },
                            ].map(({ label, value, color }) => (
                                <div key={label} className="stat-card">
                                    <div className="stat-label">{label}</div>
                                    <div className={cn("stat-value text-xl", color)}>{value}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            { label: 'Total Rooms', value: roomsReport?.length || 0 },
                            { label: 'Avg Occupancy', value: `${avgOccupancy}%` },
                            { label: 'Total Revenue', value: fmt(roomsReport?.reduce((s: number, r: any) => s + Number(r.revenue || 0), 0) || 0) },
                        ].map(({ label, value }) => (
                            <div key={label} className="stat-card">
                                <div className="stat-label">{label}</div>
                                <div className="stat-value text-xl">{value}</div>
                            </div>
                        ))}
                    </div>

                    <div className="card p-0 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100/50 dark:bg-slate-800/50">
                                <tr>
                                    <th className="th">Room Number</th>
                                    <th className="th">Room Type</th>
                                    <th className="th text-right">Bookings</th>
                                    <th className="th text-right">Occupancy %</th>
                                    <th className="th text-right">Revenue</th>
                                    <th className="th text-right">Avg. Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roomsReport?.map((room: any) => (
                                    <tr key={room.room_number} className="table-row">
                                        <td className="td font-medium">{room.room_number}</td>
                                        <td className="td">{room.room_type || '—'}</td>
                                        <td className="td text-right">{room.bookings || 0}</td>
                                        <td className={cn("td text-right font-semibold", getOccupancyColor(room.occupancy || 0))}>
                                            {room.occupancy || 0}%
                                        </td>
                                        <td className="td text-right font-bold text-amber-600 dark:text-amber-400">
                                            {fmt(Number(room.revenue || 0))}
                                        </td>
                                        <td className="td text-right">
                                            {fmt(room.avg_rate || 0)}
                                        </td>
                                    </tr>
                                ))}
                                {!roomsReport?.length && (
                                    <tr>
                                        <td colSpan={6} className="td text-center text-slate-900 dark:text-slate-500 py-8">
                                            No room data for selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Occupancy Distribution Chart */}
                    {roomsReport?.length > 0 && (
                        <div className="card">
                            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Room Occupancy Distribution</h2>
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={roomsReport?.slice(0, 10).map((r: any) => ({
                                    room: r.room_number,
                                    occupancy: r.occupancy || 0,
                                })) || []}>
                                    <XAxis dataKey="room" tick={{ fill: 'var(--chart-axis-text)', fontSize: 11 }} />
                                    <YAxis tick={{ fill: 'var(--chart-axis-text)', fontSize: 11 }} unit="%" />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8 }}
                                        formatter={(v: any) => `${v}%`}
                                    />
                                    <Bar dataKey="occupancy" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Occupancy %" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}

            {/* ════════ PAYMENTS TAB ════════ */}
            {!loading && tab === 'payments' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="card">
                        <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Payment Mix</h2>
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie
                                    data={payments?.map((p: any) => ({
                                        name: p.method, value: Number(p.total_amount),
                                    })) || []}
                                    dataKey="value" nameKey="name"
                                    cx="50%" cy="50%" outerRadius={80}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {payments?.map((_: any, i: number) => (
                                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="card p-0 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100/50 dark:bg-slate-800/50">
                                <tr>
                                    <th className="th">Method</th>
                                    <th className="th text-right">Transactions</th>
                                    <th className="th text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments?.map((p: any, i: number) => (
                                    <tr key={p.method} className="table-row">
                                        <td className="td">
                                            <span className="inline-flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full"
                                                    style={{ background: COLORS[i % COLORS.length] }} />
                                                {p.method.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="td text-right">{p.transaction_count || 0}</td>
                                        <td className="td text-right font-bold text-amber-600 dark:text-amber-400">
                                            {fmt(Number(p.total_amount || 0))}
                                        </td>
                                    </tr>
                                ))}
                                {!payments?.length && (
                                    <tr>
                                        <td colSpan={3} className="td text-center text-slate-900 dark:text-slate-500 py-8">
                                            No data for selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ════════ GST REPORT TAB ════════ */}
            {!loading && tab === 'gst' && (
                <div className="space-y-4">
                    <div className="card p-0 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100/50 dark:bg-slate-800/50">
                                <tr>
                                    <th className="th">Month</th>
                                    <th className="th text-right">Invoices</th>
                                    <th className="th text-right">Taxable Value</th>
                                    <th className="th text-right">CGST</th>
                                    <th className="th text-right">SGST</th>
                                    <th className="th text-right">IGST</th>
                                    <th className="th text-right">Total GST</th>
                                    <th className="th text-right">Gross Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gstReport?.map((row: any) => (
                                    <tr key={row.month} className="table-row">
                                        <td className="td font-medium">{dayjs(row.month).format('MMMM YYYY')}</td>
                                        <td className="td text-right text-slate-900 dark:text-slate-400">{row.total_invoices || 0}</td>
                                        <td className="td text-right">{fmt(Number(row.taxable_value || 0))}</td>
                                        <td className="td text-right text-blue-400">{fmt(Number(row.cgst || 0))}</td>
                                        <td className="td text-right text-purple-400">{fmt(Number(row.sgst || 0))}</td>
                                        <td className="td text-right text-emerald-600 dark:text-emerald-400">{fmt(Number(row.igst || 0))}</td>
                                        <td className="td text-right font-bold text-amber-600 dark:text-amber-400">
                                            {fmt(Number(row.total_tax || 0))}
                                        </td>
                                        <td className="td text-right font-bold">{fmt(Number(row.gross_value || 0))}</td>
                                    </tr>
                                ))}
                                {!gstReport?.length && (
                                    <tr>
                                        <td colSpan={8} className="td text-center text-slate-900 dark:text-slate-500 py-8">
                                            No data for selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {gstReport?.length > 0 && (
                                <tfoot className="bg-slate-50 dark:bg-slate-800/80">
                                    <tr>
                                        <td className="td font-bold">TOTAL</td>
                                        <td className="td text-right font-bold">
                                            {gstReport.reduce((s: number, r: any) => s + Number(r.total_invoices || 0), 0)}
                                        </td>
                                        <td className="td text-right font-bold">
                                            {fmt(gstReport.reduce((s: number, r: any) => s + Number(r.taxable_value || 0), 0))}
                                        </td>
                                        <td className="td text-right font-bold text-blue-400">
                                            {fmt(gstReport.reduce((s: number, r: any) => s + Number(r.cgst || 0), 0))}
                                        </td>
                                        <td className="td text-right font-bold text-purple-400">
                                            {fmt(gstReport.reduce((s: number, r: any) => s + Number(r.sgst || 0), 0))}
                                        </td>
                                        <td className="td text-right font-bold text-emerald-600 dark:text-emerald-400">
                                            {fmt(gstReport.reduce((s: number, r: any) => s + Number(r.igst || 0), 0))}
                                        </td>
                                        <td className="td text-right font-bold text-amber-600 dark:text-amber-400">
                                            {fmt(gstReport.reduce((s: number, r: any) => s + Number(r.total_tax || 0), 0))}
                                        </td>
                                        <td className="td text-right font-bold">
                                            {fmt(gstReport.reduce((s: number, r: any) => s + Number(r.gross_value || 0), 0))}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    <p className="text-xs text-slate-900 dark:text-slate-500">
                        * GSTR-1 / GSTR-3B summary. Verify with your CA before filing.
                        Use the <strong className="text-slate-600 dark:text-slate-300">GSTR-1 JSON</strong> button above to
                        download GST portal-ready JSON.
                    </p>
                </div>
            )}

            {/* ════════ FRONT DESK STAFF TAB ════════ */}
            {!loading && tab === 'frontdesk' && (
                <div className="space-y-4">
                    {frontdeskReport?.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: 'Staff Members', value: frontdeskReport.length },
                                {
                                    label: 'Total Check-ins',
                                    value: frontdeskReport.reduce((s: number, r: any) => s + Number(r.check_ins || 0), 0),
                                },
                                {
                                    label: 'Total Check-outs',
                                    value: frontdeskReport.reduce((s: number, r: any) => s + Number(r.check_outs || 0), 0),
                                },
                                {
                                    label: 'Total Revenue',
                                    value: fmt(frontdeskReport.reduce((s: number, r: any) => s + Number(r.revenue_managed || 0), 0)),
                                },
                            ].map(({ label, value }) => (
                                <div key={label} className="stat-card">
                                    <div className="stat-label">{label}</div>
                                    <div className="stat-value text-xl">{value}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="card p-0 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100/50 dark:bg-slate-800/50">
                                <tr>
                                    <th className="th">#</th>
                                    <th className="th">Staff Name</th>
                                    <th className="th text-right">Check-ins</th>
                                    <th className="th text-right">Check-outs</th>
                                    <th className="th text-right">Bookings Handled</th>
                                    <th className="th text-right">Revenue Managed</th>
                                    <th className="th text-right">Avg/Booking</th>
                                </tr>
                            </thead>
                            <tbody>
                                {frontdeskReport?.map((staff: any, i: number) => (
                                    <tr key={staff.staff_id} className="table-row">
                                        <td className="td text-slate-900 dark:text-slate-500">{i + 1}</td>
                                        <td className="td font-medium">{staff.staff_name || '—'}</td>
                                        <td className="td text-right">{staff.check_ins || 0}</td>
                                        <td className="td text-right">{staff.check_outs || 0}</td>
                                        <td className="td text-right">{staff.bookings_handled || 0}</td>
                                        <td className="td text-right font-bold text-amber-600 dark:text-amber-400">
                                            {fmt(Number(staff.revenue_managed || 0))}
                                        </td>
                                        <td className="td text-right">
                                            {fmt(Number(staff.avg_booking_value) || 0)}
                                        </td>
                                    </tr>
                                ))}
                                {!frontdeskReport?.length && (
                                    <tr>
                                        <td colSpan={7} className="td text-center text-slate-900 dark:text-slate-500 py-8">
                                            No front desk staff data for selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Performance Chart */}
                    {frontdeskReport?.length > 0 && (
                        <div className="card">
                            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Staff Performance</h2>
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={frontdeskReport?.slice(0, 8).map((s: any) => ({
                                    name: s.staff_name?.split(' ')[0] || s.staff_name,
                                    revenue: Number(s.revenue_managed || 0),
                                    bookings: Number(s.bookings_handled || 0),
                                })) || []}>
                                    <XAxis dataKey="name" tick={{ fill: 'var(--chart-axis-text)', fontSize: 11 }} />
                                    <YAxis yAxisId="left" tick={{ fill: 'var(--chart-axis-text)', fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--chart-axis-text)', fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8 }}
                                    />
                                    <Bar yAxisId="left" dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Revenue (₹)" />
                                    <Bar yAxisId="right" dataKey="bookings" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Bookings" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}