'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    BedDouble, Plus, RefreshCw, Search, X, Loader2,
    Edit3, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

type RoomStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance' | 'out_of_order';

interface RoomType {
    id: string;
    name: string;
    description: string;
    baseRate: number;
    maxOccupancy: number;
    amenities: string[];
    totalRooms: number;
    channelManagerId: string | null;
}

interface Room {
    id: string;
    roomNumber: string;
    floor: number;
    status: RoomStatus;
    notes: string;
    isActive: boolean;
    roomTypeId: string;
    roomType: RoomType;
    amenitiesOverride: string[] | null;
}

const STATUS_CFG: Record<RoomStatus, { label: string; dot: string; bg: string }> = {
    available: { label: 'Available', dot: 'bg-emerald-500', bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
    occupied: { label: 'Occupied', dot: 'bg-blue-500', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    reserved: { label: 'Reserved', dot: 'bg-amber-500', bg: 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-500/30' },
    cleaning: { label: 'Cleaning', dot: 'bg-violet-500', bg: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
    maintenance: { label: 'Maintenance', dot: 'bg-orange-500', bg: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
    out_of_order: { label: 'Out of Order', dot: 'bg-red-500', bg: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30' },
};

const ALL_STATUSES = Object.keys(STATUS_CFG) as RoomStatus[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrapArray(d: any): any[] {
    if (Array.isArray(d)) return d;
    if (d?.data && Array.isArray(d.data)) return d.data;
    return [];
}

// ─── Room / RoomType Form Modal ───────────────────────────────────────────────

function RoomModal({
    room,
    roomTypes,
    onClose,
}: {
    room: Room | null; // null = create
    roomTypes: RoomType[];
    onClose: () => void;
}) {
    const qc = useQueryClient();
    const isEdit = !!room;

    const [form, setForm] = useState({
        roomNumber: room?.roomNumber ?? '',
        floor: room?.floor ?? 1,
        roomTypeId: room?.roomTypeId ?? (roomTypes[0]?.id ?? ''),
        notes: room?.notes ?? '',
        status: room?.status ?? 'available' as RoomStatus,
    });

    const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

    const { mutate, isPending } = useMutation({
        mutationFn: (body: typeof form) =>
            isEdit
                ? api.patch(`/api/v1/hotel/rooms/${room!.id}`, body).then((r) => r.data)
                : api.post('/api/v1/hotel/rooms', body).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['rooms-list'] });
            qc.invalidateQueries({ queryKey: ['hotel-rooms'] });
            qc.invalidateQueries({ queryKey: ['hotel-dashboard'] });
            onClose();
        },
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{isEdit ? 'Edit Room' : 'Add Room'}</h3>
                    <button onClick={onClose} className="p-1 text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300"><X size={16} /></button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-slate-900 dark:text-slate-400">Room Number *</label>
                        <input value={form.roomNumber} onChange={(e) => set('roomNumber', e.target.value)} className="input-field text-sm w-full" placeholder="e.g. 101" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-slate-900 dark:text-slate-400">Floor</label>
                        <input type="number" value={form.floor} onChange={(e) => set('floor', +e.target.value)} className="input-field text-sm w-full" min={0} />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-slate-900 dark:text-slate-400">Room Type *</label>
                    <select value={form.roomTypeId} onChange={(e) => set('roomTypeId', e.target.value)} className="input-field text-sm w-full">
                        <option value="">Select type…</option>
                        {roomTypes.map((rt) => (
                            <option key={rt.id} value={rt.id}>{rt.name} — ₹{Number(rt.baseRate).toLocaleString('en-IN')}/night</option>
                        ))}
                    </select>
                </div>

                {isEdit && (
                    <div className="space-y-1">
                        <label className="text-xs text-slate-900 dark:text-slate-400">Status</label>
                        <select value={form.status} onChange={(e) => set('status', e.target.value)} className="input-field text-sm w-full">
                            {ALL_STATUSES.map((s) => (
                                <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="space-y-1">
                    <label className="text-xs text-slate-900 dark:text-slate-400">Notes</label>
                    <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} className="input-field text-sm w-full resize-none" placeholder="Optional notes…" />
                </div>

                <div className="flex gap-2 pt-1">
                    <button
                        onClick={() => mutate(form)}
                        disabled={!form.roomNumber || !form.roomTypeId || isPending}
                        className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm"
                    >
                        {isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        {isEdit ? 'Save Changes' : 'Add Room'}
                    </button>
                    <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors">Cancel</button>
                </div>
            </div>
        </div>
    );
}

// ─── Room Type Modal ──────────────────────────────────────────────────────────

function RoomTypeModal({
    roomType,
    onClose,
}: {
    roomType: RoomType | null;
    onClose: () => void;
}) {
    const qc = useQueryClient();
    const isEdit = !!roomType;

    const [form, setForm] = useState({
        name: roomType?.name ?? '',
        description: roomType?.description ?? '',
        baseRate: roomType?.baseRate ?? 0,
        maxOccupancy: roomType?.maxOccupancy ?? 2,
        amenities: (roomType?.amenities ?? []).join(', '),
        channelManagerId: roomType?.channelManagerId ?? '',
    });

    const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

    const { mutate, isPending } = useMutation({
        mutationFn: (body: any) =>
            isEdit
                ? api.patch(`/api/v1/hotel/room-types/${roomType!.id}`, body).then((r) => r.data)
                : api.post('/api/v1/hotel/room-types', body).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['room-types'] });
            onClose();
        },
    });

    const handleSubmit = () => {
        const body = {
            ...form,
            baseRate: Number(form.baseRate),
            amenities: form.amenities.split(',').map((s: string) => s.trim()).filter(Boolean),
        };
        mutate(body);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{isEdit ? 'Edit Room Type' : 'New Room Type'}</h3>
                    <button onClick={onClose} className="p-1 text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300"><X size={16} /></button>
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-slate-900 dark:text-slate-400">Name *</label>
                    <input value={form.name} onChange={(e) => set('name', e.target.value)} className="input-field text-sm w-full" placeholder="e.g. Deluxe Double" />
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-slate-900 dark:text-slate-400">Description</label>
                    <input value={form.description} onChange={(e) => set('description', e.target.value)} className="input-field text-sm w-full" placeholder="Brief description" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-slate-900 dark:text-slate-400">Base Rate (₹/night) *</label>
                        <input type="number" value={form.baseRate} onChange={(e) => set('baseRate', e.target.value)} className="input-field text-sm w-full" min={0} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-slate-900 dark:text-slate-400">Max Occupancy</label>
                        <input type="number" value={form.maxOccupancy} onChange={(e) => set('maxOccupancy', +e.target.value)} className="input-field text-sm w-full" min={1} />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-slate-900 dark:text-slate-400">Amenities (comma-separated)</label>
                    <input value={form.amenities} onChange={(e) => set('amenities', e.target.value)} className="input-field text-sm w-full" placeholder="AC, WiFi, TV, Mini-bar" />
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-slate-900 dark:text-slate-400">Channel Manager ID (Optional)</label>
                    <input value={form.channelManagerId} onChange={(e) => set('channelManagerId', e.target.value)} className="input-field text-sm font-mono w-full" placeholder="e.g. OTA_DELUXE_ROOM" />
                    <p className="text-[10px] text-slate-500">Provided by your Channel Manager to sync bookings.</p>
                </div>

                <div className="flex gap-2 pt-1">
                    <button onClick={handleSubmit} disabled={!form.name || isPending} className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm">
                        {isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        {isEdit ? 'Save' : 'Create Type'}
                    </button>
                    <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors">Cancel</button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoomsPage() {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<RoomStatus | ''>('');
    const [typeFilter, setTypeFilter] = useState('');
    const [showRoomModal, setShowRoomModal] = useState(false);
    const [editRoom, setEditRoom] = useState<Room | null>(null);
    const [showTypeModal, setShowTypeModal] = useState(false);
    const [editType, setEditType] = useState<RoomType | null>(null);
    const [tab, setTab] = useState<'rooms' | 'types'>('rooms');

    // Fetch rooms
    const { data: roomsRaw, isLoading, refetch } = useQuery<Room[]>({
        queryKey: ['rooms-list'],
        queryFn: () => api.get('/api/v1/hotel/rooms').then((r) => unwrapArray(r.data)),
        staleTime: 30_000,
    });

    // Fetch room types
    const { data: typesRaw, isLoading: typesLoading } = useQuery<RoomType[]>({
        queryKey: ['room-types'],
        queryFn: () => api.get('/api/v1/hotel/room-types').then((r) => unwrapArray(r.data)),
        staleTime: 60_000,
    });

    const rooms: Room[] = Array.isArray(roomsRaw) ? roomsRaw : [];
    const roomTypes: RoomType[] = Array.isArray(typesRaw) ? typesRaw : [];

    // Filter rooms
    const filtered = rooms.filter((r) => {
        if (statusFilter && r.status !== statusFilter) return false;
        if (typeFilter && r.roomTypeId !== typeFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            if (!r.roomNumber.toLowerCase().includes(q) && !r.roomType?.name?.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    // Group by floor
    const floors = Array.from(new Set(filtered.map((r) => r.floor))).sort((a, b) => a - b);
    const byFloor = (floor: number) => filtered.filter((r) => r.floor === floor);

    // Status counts
    const statusCounts = rooms.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
    }, {});

    // Delete room type
    const { mutate: deleteType } = useMutation({
        mutationFn: (id: string) => api.delete(`/api/v1/hotel/room-types/${id}`).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['room-types'] }),
    });

    const loading = tab === 'rooms' ? isLoading : typesLoading;

    return (
        <div className="flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                        <BedDouble size={16} className="text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-slate-900 dark:text-white">Rooms</h1>
                        <p className="text-xs text-slate-900 dark:text-slate-500">Manage rooms &amp; room types</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => refetch()} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400 transition-colors">
                        <RefreshCw size={13} />
                    </button>
                    {tab === 'rooms' ? (
                        <button onClick={() => { setEditRoom(null); setShowRoomModal(true); }} className="btn-primary text-xs flex items-center gap-1.5">
                            <Plus size={13} /> Add Room
                        </button>
                    ) : (
                        <button onClick={() => { setEditType(null); setShowTypeModal(true); }} className="btn-primary text-xs flex items-center gap-1.5">
                            <Plus size={13} /> Add Type
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-4 px-6 py-2.5 border-b border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-900/30 flex-shrink-0">
                {(['rooms', 'types'] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            'text-sm font-medium pb-1 border-b-2 transition-colors',
                            tab === t ? 'border-amber-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300',
                        )}
                    >
                        {t === 'rooms' ? `Rooms (${rooms.length})` : `Room Types (${roomTypes.length})`}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {tab === 'rooms' && (
                    <>
                        {/* Filters bar */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[200px] max-w-xs">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900 dark:text-slate-500" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search rooms…"
                                    className="input-field text-sm w-full pl-8"
                                />
                            </div>
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="input-field text-sm w-40">
                                <option value="">All statuses</option>
                                {ALL_STATUSES.map((s) => (
                                    <option key={s} value={s}>{STATUS_CFG[s].label} ({statusCounts[s] ?? 0})</option>
                                ))}
                            </select>
                            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-field text-sm w-44">
                                <option value="">All types</option>
                                {roomTypes.map((rt) => (
                                    <option key={rt.id} value={rt.id}>{rt.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Status summary pills */}
                        <div className="flex flex-wrap gap-2">
                            {ALL_STATUSES.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                                    className={cn(
                                        'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all',
                                        statusFilter === s ? STATUS_CFG[s].bg : 'border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:border-slate-600',
                                    )}
                                >
                                    <span className={cn('w-2 h-2 rounded-full', STATUS_CFG[s].dot)} />
                                    {STATUS_CFG[s].label}
                                    <span className="font-mono">{statusCounts[s] ?? 0}</span>
                                </button>
                            ))}
                        </div>

                        {/* Room grid by floor */}
                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 size={24} className="animate-spin text-slate-600" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="card text-center py-16 space-y-3">
                                <BedDouble size={40} className="text-slate-700 mx-auto" />
                                <p className="text-slate-900 dark:text-slate-500 text-sm">
                                    {rooms.length === 0 ? 'No rooms added yet.' : 'No rooms match your filters.'}
                                </p>
                                {rooms.length === 0 && (
                                    <button onClick={() => { setEditRoom(null); setShowRoomModal(true); }} className="btn-primary text-xs inline-flex items-center gap-1.5">
                                        <Plus size={12} /> Add your first room
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {floors.map((floor) => (
                                    <div key={floor}>
                                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-500 uppercase tracking-wider mb-2">
                                            Floor {floor} · {byFloor(floor).length} rooms
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                                            {byFloor(floor).map((room) => {
                                                const cfg = STATUS_CFG[room.status] ?? STATUS_CFG.available;
                                                return (
                                                    <button
                                                        key={room.id}
                                                        onClick={() => { setEditRoom(room); setShowRoomModal(true); }}
                                                        className={cn(
                                                            'flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all hover:scale-[1.03] active:scale-100',
                                                            cfg.bg,
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between w-full">
                                                            <span className="text-sm font-bold">{room.roomNumber}</span>
                                                            <span className={cn('w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
                                                        </div>
                                                        <div className="text-[10px] opacity-70 truncate w-full">{room.roomType?.name ?? '—'}</div>
                                                        <div className="text-[10px] font-medium uppercase tracking-wide opacity-80">{cfg.label}</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {tab === 'types' && (
                    <>
                        {typesLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 size={24} className="animate-spin text-slate-600" />
                            </div>
                        ) : roomTypes.length === 0 ? (
                            <div className="card text-center py-16 space-y-3">
                                <BedDouble size={40} className="text-slate-700 mx-auto" />
                                <p className="text-slate-900 dark:text-slate-500 text-sm">No room types configured yet.</p>
                                <button onClick={() => { setEditType(null); setShowTypeModal(true); }} className="btn-primary text-xs inline-flex items-center gap-1.5">
                                    <Plus size={12} /> Create room type
                                </button>
                            </div>
                        ) : (
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {roomTypes.map((rt) => (
                                    <div key={rt.id} className="card space-y-3">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="text-sm font-semibold text-slate-900 dark:text-white">{rt.name}</div>
                                                {rt.description && <div className="text-xs text-slate-900 dark:text-slate-500 mt-0.5">{rt.description}</div>}
                                            </div>
                                            <button
                                                onClick={() => { setEditType(rt); setShowTypeModal(true); }}
                                                className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors"
                                            >
                                                <Edit3 size={13} />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div>
                                                <div className="text-lg font-bold text-slate-900 dark:text-white">₹{Number(rt.baseRate).toLocaleString('en-IN')}</div>
                                                <div className="text-[10px] text-slate-900 dark:text-slate-500">per night</div>
                                            </div>
                                            <div>
                                                <div className="text-lg font-bold text-slate-900 dark:text-white">{rt.maxOccupancy}</div>
                                                <div className="text-[10px] text-slate-900 dark:text-slate-500">max guests</div>
                                            </div>
                                            <div>
                                                <div className="text-lg font-bold text-slate-900 dark:text-white">{rt.totalRooms}</div>
                                                <div className="text-[10px] text-slate-900 dark:text-slate-500">rooms</div>
                                            </div>
                                        </div>
                                        {rt.amenities?.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {rt.amenities.map((a) => (
                                                    <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700/60 text-slate-900 dark:text-slate-400 border border-slate-300 dark:border-slate-600/50">
                                                        {a}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modals */}
            {showRoomModal && (
                <RoomModal
                    room={editRoom}
                    roomTypes={roomTypes}
                    onClose={() => { setShowRoomModal(false); setEditRoom(null); }}
                />
            )}
            {showTypeModal && (
                <RoomTypeModal
                    roomType={editType}
                    onClose={() => { setShowTypeModal(false); setEditType(null); }}
                />
            )}
        </div>
    );
}
