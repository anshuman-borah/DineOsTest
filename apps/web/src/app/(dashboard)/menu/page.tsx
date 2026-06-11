'use client';
import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost, apiPut, apiDelete, api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight,
  ImagePlus, X, Loader2, Tag, Percent, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ItemForm {
  name: string;
  price: string;
  categoryId: string;
  isVeg: boolean;
  description: string;
  sku: string;
  gstRateId: string;
  imageUrl: string;
}

interface CategoryForm {
  name: string;
  description: string;
  color: string;
  sortOrder: string;
}

interface GstForm {
  name: string;
  rate: string;
  hsnSacCode: string;
}

const EMPTY_ITEM_FORM: ItemForm = {
  name: '', price: '', categoryId: '', isVeg: true,
  description: '', sku: '', gstRateId: '', imageUrl: '',
};

const EMPTY_CAT_FORM: CategoryForm = {
  name: '', description: '', color: '', sortOrder: '0',
};

const EMPTY_GST_FORM: GstForm = {
  name: '', rate: '', hsnSacCode: '9963',
};

type SidebarView = 'items' | 'categories' | 'gst';

// ─── Image helpers ─────────────────────────────────────────────────────────────
async function uploadMenuImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post('/api/v1/storage/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return normaliseImageUrl(res.data?.data?.url ?? res.data?.url ?? '');
}

function normaliseImageUrl(url: string): string {
  if (!url) return '';
  // Full URL (Cloudinary CDN, or http://localhost:4000/static/...) → use as-is
  if (url.startsWith('http')) return url;
  // Relative /static/... path → prefix with API base URL
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  if (url.startsWith('/static/')) return `${apiBase}${url}`;
  return url;
}

// ─── Image Picker ──────────────────────────────────────────────────────────────
function ImagePicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return; }
    setUploading(true);
    try {
      onChange(await uploadMenuImage(file));
      toast.success('Image uploaded');
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  return (
    <div className="col-span-2">
      <label className="label">Item Image</label>
      {value ? (
        <div className="relative w-full h-40 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 group">
          {/* Plain <img> works with any URL (Cloudinary, local, etc.) without Next.js domain config */}
          <img src={normaliseImageUrl(value)} alt="Menu item"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <button type="button" onClick={() => onChange('')}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-white dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <X size={14} />
          </button>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 btn-secondary text-xs py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
            Change
          </button>
        </div>
      ) : (
        <div
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'w-full h-32 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-2',
            'text-slate-900 dark:text-slate-500 cursor-pointer hover:border-amber-600 hover:text-amber-500 transition-colors',
            uploading && 'pointer-events-none opacity-60',
          )}>
          {uploading
            ? <><Loader2 size={20} className="animate-spin text-amber-600 dark:text-amber-400" /><span className="text-xs">Uploading…</span></>
            : <><ImagePlus size={20} /><span className="text-xs text-center px-4">Click or drag image<br /><span className="text-slate-600">JPG/PNG/WebP · max 5 MB</span></span></>}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function MenuPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<SidebarView>('items');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Item form
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM_FORM);

  // Category form
  const [showCatForm, setShowCatForm] = useState(false);
  const [editCat, setEditCat] = useState<any>(null);
  const [catForm, setCatForm] = useState<CategoryForm>(EMPTY_CAT_FORM);

  // GST form
  const [showGstForm, setShowGstForm] = useState(false);
  const [editGst, setEditGst] = useState<any>(null);
  const [gstForm, setGstForm] = useState<GstForm>(EMPTY_GST_FORM);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch('/api/v1/menu/categories').then((r) => r.data),
  });

  const { data: items } = useQuery({
    queryKey: ['menuItems', selectedCat],
    queryFn: () =>
      apiFetch(`/api/v1/menu/items${selectedCat ? `?categoryId=${selectedCat}` : ''}`).then((r) => r.data),
  });

  const { data: gstRates } = useQuery({
    queryKey: ['gstRates'],
    queryFn: () => apiFetch('/api/v1/menu/gst-rates').then((r) => r.data),
  });

  const filtered = items?.filter(
    (i: any) => !search || i.name.toLowerCase().includes(search.toLowerCase()),
  ) ?? [];

  // ── Item mutations ────────────────────────────────────────────────────────────
  const saveItemMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...itemForm,
        price: parseFloat(itemForm.price),
        imageUrl: itemForm.imageUrl || undefined,
        categoryId: itemForm.categoryId || null,
        gstRateId: itemForm.gstRateId || null,
      };
      return editItem
        ? apiPut(`/api/v1/menu/items/${editItem.id}`, payload)
        : apiPost('/api/v1/menu/items', payload);
    },
    onSuccess: () => {
      toast.success('Menu item saved');
      qc.invalidateQueries({ queryKey: ['menuItems'] });
      setShowItemForm(false); setEditItem(null); setItemForm(EMPTY_ITEM_FORM);
    },
    onError: () => toast.error('Save failed'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPut(`/api/v1/menu/items/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menuItems'] }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/menu/items/${id}`),
    onSuccess: () => { toast.success('Item removed'); qc.invalidateQueries({ queryKey: ['menuItems'] }); },
  });

  // ── Category mutations ────────────────────────────────────────────────────────
  const saveCatMutation = useMutation({
    mutationFn: () => {
      const payload = { ...catForm, sortOrder: parseInt(catForm.sortOrder) || 0 };
      return editCat
        ? apiPut(`/api/v1/menu/categories/${editCat.id}`, payload)
        : apiPost('/api/v1/menu/categories', payload);
    },
    onSuccess: () => {
      toast.success('Category saved');
      qc.invalidateQueries({ queryKey: ['categories'] });
      setShowCatForm(false); setEditCat(null); setCatForm(EMPTY_CAT_FORM);
    },
    onError: () => toast.error('Save failed'),
  });

  const deleteCatMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/menu/categories/${id}`),
    onSuccess: () => { toast.success('Category removed'); qc.invalidateQueries({ queryKey: ['categories'] }); },
  });

  // ── GST mutations ─────────────────────────────────────────────────────────────
  const saveGstMutation = useMutation({
    mutationFn: () => {
      const payload = { ...gstForm, rate: parseFloat(gstForm.rate) };
      return editGst
        ? apiPut(`/api/v1/menu/gst-rates/${editGst.id}`, payload)
        : apiPost('/api/v1/menu/gst-rates', payload);
    },
    onSuccess: () => {
      toast.success('GST rate saved');
      qc.invalidateQueries({ queryKey: ['gstRates'] });
      setShowGstForm(false); setEditGst(null); setGstForm(EMPTY_GST_FORM);
    },
    onError: () => toast.error('Save failed'),
  });

  const deleteGstMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/menu/gst-rates/${id}`),
    onSuccess: () => { toast.success('GST rate removed'); qc.invalidateQueries({ queryKey: ['gstRates'] }); },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function openCreateItem() {
    setEditItem(null);
    setItemForm({ ...EMPTY_ITEM_FORM, categoryId: selectedCat || '' });
    setShowItemForm(true);
  }

  function openEditItem(item: any) {
    setEditItem(item);
    setItemForm({
      name: item.name,
      price: item.price.toString(),
      categoryId: item.categoryId ?? item.category_id ?? '',
      isVeg: item.isVeg ?? item.is_veg ?? true,
      description: item.description || '',
      sku: item.sku || '',
      gstRateId: item.gstRateId ?? item.gst_rate_id ?? '',
      imageUrl: normaliseImageUrl(item.imageUrl ?? item.image_url ?? ''),
    });
    setShowItemForm(true);
  }

  function openEditCat(cat: any) {
    setEditCat(cat);
    setCatForm({
      name: cat.name,
      description: cat.description || '',
      color: cat.color || '',
      sortOrder: String(cat.sortOrder ?? 0),
    });
    setShowCatForm(true);
  }

  function openEditGst(gst: any) {
    setEditGst(gst);
    setGstForm({
      name: gst.name,
      rate: String(gst.rate),
      hsnSacCode: gst.hsnSacCode || '9963',
    });
    setShowGstForm(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full">

      {/* ── Left sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-48 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-1">
        <div className="text-xs font-semibold text-slate-900 dark:text-slate-500 uppercase mb-2 px-2">Menu</div>
        <button onClick={() => setView('items')}
          className={cn('sidebar-link w-full', view === 'items' && 'sidebar-link-active')}>
          <ChevronRight size={14} /> Items
        </button>
        <button onClick={() => setView('categories')}
          className={cn('sidebar-link w-full', view === 'categories' && 'sidebar-link-active')}>
          <Tag size={14} /> Categories
        </button>
        <button onClick={() => setView('gst')}
          className={cn('sidebar-link w-full', view === 'gst' && 'sidebar-link-active')}>
          <Percent size={14} /> GST Rates
        </button>

        {view === 'items' && (
          <>
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-500 uppercase mt-4 mb-1 px-2">Filter by</div>
            <button onClick={() => setSelectedCat(null)}
              className={cn('sidebar-link w-full', !selectedCat && 'sidebar-link-active')}>
              All Items
            </button>
            {categories?.map((c: any) => (
              <button key={c.id} onClick={() => setSelectedCat(c.id)}
                className={cn('sidebar-link w-full text-left truncate', selectedCat === c.id && 'sidebar-link-active')}>
                {c.name}
              </button>
            ))}
          </>
        )}
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ════════════════ ITEMS VIEW ════════════════ */}
        {view === 'items' && (
          <>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900 dark:text-slate-400" />
                <input className="input pl-8" placeholder="Search items…" value={search}
                  onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button onClick={openCreateItem} className="btn-primary">
                <Plus size={14} /> Add Item
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filtered.map((item: any) => (
                <div key={item.id}
                  className={cn('card flex items-center gap-4', !item.isActive && 'opacity-40')}>
                  <div className={cn('w-3 h-3 rounded-sm border flex-shrink-0',
                    item.isVeg ? 'border-emerald-500' : 'border-red-500')}>
                    <div className={cn('w-1.5 h-1.5 rounded-full m-0.5',
                      item.isVeg ? 'bg-emerald-500' : 'bg-red-500')} />
                  </div>
                  {(item.imageUrl || item.image_url) ? (
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-slate-300 dark:border-slate-700">
                      <Image src={normaliseImageUrl(item.imageUrl || item.image_url)} alt={item.name}
                        fill className="object-cover" unoptimized
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-300 dark:border-slate-700">
                      <ImagePlus size={14} className="text-slate-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 dark:text-white truncate">{item.name}</div>
                    <div className="text-xs text-slate-900 dark:text-slate-500">{item.sku || '—'}</div>
                  </div>
                  <div className="text-amber-600 dark:text-amber-400 font-bold whitespace-nowrap">₹{item.price}</div>
                  <div className="text-xs text-slate-900 dark:text-slate-500">{item.gstRate?.rate ?? 0}% GST</div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleMutation.mutate({ id: item.id, isActive: !item.isActive })}>
                      {item.isActive
                        ? <ToggleRight size={20} className="text-emerald-600 dark:text-emerald-400" />
                        : <ToggleLeft size={20} className="text-slate-900 dark:text-slate-400" />}
                    </button>
                    <button onClick={() => openEditItem(item)} className="btn-ghost p-1"><Edit2 size={14} /></button>
                    <button onClick={() => deleteItemMutation.mutate(item.id)}
                      className="btn-ghost p-1 text-red-600 dark:text-red-400 hover:text-red-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-16 text-slate-900 dark:text-slate-500">No items found</div>
              )}
            </div>
          </>
        )}

        {/* ════════════════ CATEGORIES VIEW ════════════════ */}
        {view === 'categories' && (
          <>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">Categories</h2>
              <button onClick={() => { setEditCat(null); setCatForm(EMPTY_CAT_FORM); setShowCatForm(true); }}
                className="btn-primary">
                <Plus size={14} /> Add Category
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {categories?.map((cat: any) => (
                <div key={cat.id} className="card flex items-center gap-4">
                  <div className="w-4 h-4 rounded-full flex-shrink-0 border border-slate-300 dark:border-slate-600"
                    style={{ backgroundColor: cat.color || '#64748b' }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 dark:text-white">{cat.name}</div>
                    {cat.description && (
                      <div className="text-xs text-slate-900 dark:text-slate-500 truncate">{cat.description}</div>
                    )}
                  </div>
                  <div className="text-xs text-slate-900 dark:text-slate-500">Sort: {cat.sortOrder}</div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditCat(cat)} className="btn-ghost p-1"><Edit2 size={14} /></button>
                    <button onClick={() => {
                      if (confirm(`Delete category "${cat.name}"? Items in this category will become uncategorised.`)) {
                        deleteCatMutation.mutate(cat.id);
                      }
                    }} className="btn-ghost p-1 text-red-600 dark:text-red-400 hover:text-red-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {(!categories || categories.length === 0) && (
                <div className="text-center py-16 text-slate-900 dark:text-slate-500">No categories yet. Add one above.</div>
              )}
            </div>
          </>
        )}

        {/* ════════════════ GST RATES VIEW ════════════════ */}
        {view === 'gst' && (
          <>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">GST Rates</h2>
              <button onClick={() => { setEditGst(null); setGstForm(EMPTY_GST_FORM); setShowGstForm(true); }}
                className="btn-primary">
                <Plus size={14} /> Add GST Rate
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {gstRates?.map((gst: any) => (
                <div key={gst.id} className="card flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">{gst.rate}%</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 dark:text-white">{gst.name}</div>
                    <div className="text-xs text-slate-900 dark:text-slate-500">
                      CGST {gst.cgstRate}% · SGST {gst.sgstRate}% · IGST {gst.igstRate}%
                      {gst.hsnSacCode && ` · HSN ${gst.hsnSacCode}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditGst(gst)} className="btn-ghost p-1"><Edit2 size={14} /></button>
                    <button onClick={() => {
                      if (confirm(`Delete GST rate "${gst.name}"?`)) {
                        deleteGstMutation.mutate(gst.id);
                      }
                    }} className="btn-ghost p-1 text-red-600 dark:text-red-400 hover:text-red-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {(!gstRates || gstRates.length === 0) && (
                <div className="text-center py-16 text-slate-900 dark:text-slate-500">
                  No GST rates found. They will be auto-created when you open this page.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Item Form Modal ──────────────────────────────────────────────────── */}
      {showItemForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white">{editItem ? 'Edit Item' : 'Add Menu Item'}</h3>
              <button onClick={() => setShowItemForm(false)} className="text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ImagePicker value={itemForm.imageUrl}
                onChange={(url) => setItemForm({ ...itemForm, imageUrl: url })} />

              <div className="col-span-2">
                <label className="label">Item Name *</label>
                <input className="input" value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
              </div>

              <div>
                <label className="label">Price (₹) *</label>
                <input className="input" type="number" min={0} step={0.01} value={itemForm.price}
                  onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} />
              </div>
              <div>
                <label className="label">SKU / Code</label>
                <input className="input" value={itemForm.sku}
                  onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} />
              </div>

              <div>
                <label className="label">Category</label>
                <select className="input" value={itemForm.categoryId}
                  onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}>
                  <option value="">— None —</option>
                  {categories?.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">GST Rate</label>
                <select className="input" value={itemForm.gstRateId}
                  onChange={(e) => setItemForm({ ...itemForm, gstRateId: e.target.value })}>
                  <option value="">— Exempt —</option>
                  {gstRates?.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.name} ({g.rate}%)</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="label">Description</label>
                <textarea className="input" rows={2} value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
              </div>

              <div className="col-span-2 flex items-center gap-3">
                <label className="label mb-0">Food type:</label>
                <button type="button" onClick={() => setItemForm({ ...itemForm, isVeg: true })}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border',
                    itemForm.isVeg ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20' : 'border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-400')}>
                  🟢 Veg
                </button>
                <button type="button" onClick={() => setItemForm({ ...itemForm, isVeg: false })}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border',
                    !itemForm.isVeg ? 'border-red-500 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20' : 'border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-400')}>
                  🔴 Non-Veg
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowItemForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => saveItemMutation.mutate()}
                disabled={saveItemMutation.isPending || !itemForm.name || !itemForm.price}
                className="btn-primary flex-1">
                {saveItemMutation.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : 'Save Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Category Form Modal ──────────────────────────────────────────────── */}
      {showCatForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white">{editCat ? 'Edit Category' : 'Add Category'}</h3>
              <button onClick={() => setShowCatForm(false)} className="text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Name *</label>
                <input className="input" value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" value={catForm.description}
                  onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={catForm.color || '#64748b'}
                      onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}
                      className="w-10 h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer p-1" />
                    <input className="input flex-1" value={catForm.color}
                      onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}
                      placeholder="#64748b" maxLength={7} />
                  </div>
                </div>
                <div>
                  <label className="label">Sort Order</label>
                  <input className="input" type="number" min={0} value={catForm.sortOrder}
                    onChange={(e) => setCatForm({ ...catForm, sortOrder: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCatForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => saveCatMutation.mutate()}
                disabled={saveCatMutation.isPending || !catForm.name}
                className="btn-primary flex-1">
                {saveCatMutation.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : 'Save Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GST Rate Form Modal ──────────────────────────────────────────────── */}
      {showGstForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white">{editGst ? 'Edit GST Rate' : 'Add GST Rate'}</h3>
              <button onClick={() => setShowGstForm(false)} className="text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Name *</label>
                <input className="input" value={gstForm.name} placeholder="e.g. GST 5%"
                  onChange={(e) => setGstForm({ ...gstForm, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Rate (%) *</label>
                <input className="input" type="number" min={0} max={28} step={0.01}
                  value={gstForm.rate} placeholder="e.g. 5"
                  onChange={(e) => setGstForm({ ...gstForm, rate: e.target.value })} />
                {gstForm.rate && (
                  <p className="text-xs text-slate-900 dark:text-slate-500 mt-1">
                    CGST {(parseFloat(gstForm.rate) / 2).toFixed(2)}% ·
                    SGST {(parseFloat(gstForm.rate) / 2).toFixed(2)}% ·
                    IGST {parseFloat(gstForm.rate).toFixed(2)}%
                  </p>
                )}
              </div>
              <div>
                <label className="label">HSN / SAC Code</label>
                <input className="input" value={gstForm.hsnSacCode} placeholder="9963"
                  onChange={(e) => setGstForm({ ...gstForm, hsnSacCode: e.target.value })} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowGstForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => saveGstMutation.mutate()}
                disabled={saveGstMutation.isPending || !gstForm.name || !gstForm.rate}
                className="btn-primary flex-1">
                {saveGstMutation.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : 'Save GST Rate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}