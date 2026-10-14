import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Minus, Pencil, Plus, RefreshCw, Search, Tags, Trash2, Upload, X } from 'lucide-react';
import { useProducts } from '../../context/ProductContext';
import {
  Product,
  Variant,
  defaultVariants,
  formatCLP,
  getVariants,
  priceLabel,
  sizesLabel,
  stockOf,
} from '../../lib/catalog';
import { ProductImage } from '../ui/ProductImage';
import { resolveImage } from '../../lib/productImage';
import { adminFetch } from './api';
import { addProduct, applyPriceList, seedProducts, updateProduct } from './productWrites';

/** Resizes to max 700px and compresses to WebP (saved with the product). */
async function processImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 700 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/webp', 0.78);
}

function EditSheet({ product, isNew, allProducts, onSaved, onClose }: { product: Product; isNew: boolean; allProducts: Product[]; onSaved: () => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<Product>(() => ({ ...product, stockCount: product.stockCount ?? stockOf(product), variants: getVariants(product) }));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const setVariant = (idx: number, patch: Partial<Variant>) =>
    setForm((f) => ({ ...f, variants: f.variants!.map((v, i) => (i === idx ? { ...v, ...patch } : v)) }));

  const save = async () => {
    setErr('');
    const variants = (form.variants || []).map((v) => ({ size: v.size.trim(), price: v.price }));
    if (!form.name.trim()) return setErr('El nombre es obligatorio.');
    if (!variants.length) return setErr('Agrega al menos un tamaño con precio.');
    if (variants.some((v) => !v.size || !Number.isSafeInteger(v.price) || v.price <= 0))
      return setErr('Cada tamaño debe tener un nombre y un precio entero mayor a cero.');
    if (new Set(variants.map((v) => v.size.toLowerCase())).size !== variants.length)
      return setErr('Los tamaños no pueden repetirse.');
    if (isNew && (!/^[MFU]\d+$/i.test(form.id) || allProducts.some((p) => p.id === form.id.toUpperCase())))
      return setErr('Código inválido o repetido. Usa M (hombre), F (mujer) o U (unisex) + número, ej: M120.');
    const min = Math.min(...variants.map((v) => v.price));
    const count = form.stockCount ?? 0;
    if (!Number.isInteger(count) || count < 0 || count > 9999) return setErr('El stock debe ser un número entero entre 0 y 9999.');
    if (count < (product.reservedCount ?? 0)) return setErr('El stock físico no puede ser menor a las unidades reservadas.');
    const data: Product & { expectedStockCount?: number } = {
      ...form,
      id: form.id.toUpperCase(),
      name: form.name.trim(),
      brand: (form.brand || '').trim(),
      variants,
      price: min,
      displayPrice: formatCLP(min),
      size: variants.map((v) => v.size).join(' / '),
      stockCount: count,
      stock: count > (product.reservedCount ?? 0) ? 'DISPONIBLE' : 'AGOTADO',
    };
    delete data.reservedCount;
    delete data.availableCount;
    if (!isNew) {
      const originalStock = product.stockCount ?? stockOf(product);
      // Editing a name or price must not overwrite stock sold since opening.
      if (count === originalStock) delete data.stockCount;
      else data.expectedStockCount = originalStock;
    }
    // Images already stored inline are exposed as /api/products/... URLs; don't overwrite them.
    if (data.image?.startsWith('/api/products/')) delete data.image;
    setSaving(true);
    try {
      if (isNew) await addProduct(data);
      else {
        // Send only fields changed in this editor, so saving one field does not
        // overwrite another administrator's unrelated updates.
        const changes: Partial<Product> & { expectedStockCount?: number } = {};
        if (data.name !== product.name) changes.name = data.name;
        if (data.brand !== (product.brand || '')) changes.brand = data.brand;
        if (data.type !== product.type) changes.type = data.type;
        if (!!data.hidden !== !!product.hidden) changes.hidden = !!data.hidden;
        if (data.image !== undefined && data.image !== product.image) changes.image = data.image;
        if (JSON.stringify(variants) !== JSON.stringify(getVariants(product))) changes.variants = variants;
        if (data.stockCount !== undefined) { changes.stockCount = data.stockCount; changes.expectedStockCount = data.expectedStockCount; }
        if (Object.keys(changes).length) await updateProduct(data.id, changes);
      }
      await onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full h-11 px-3 rounded-lg border border-neutral-200 text-base md:text-sm bg-white';
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-lg max-h-[92svh] rounded-t-2xl md:rounded-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-neutral-100">
          <h3 className="font-display text-2xl">{isNew ? 'Nuevo producto' : 'Editar producto'}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex gap-3 items-center">
            <div className="w-20 h-24 rounded-lg overflow-hidden bg-neutral-100 shrink-0">
              <ProductImage src={form.image} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 space-y-2">
              <label className={`h-10 px-4 rounded-full bg-neutral-900 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload className="w-4 h-4" /> {uploading ? 'Subiendo…' : 'Subir foto'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      const url = await processImage(file);
                      setForm((f) => ({ ...f, image: url }));
                    } catch {
                      setErr('No se pudo procesar la imagen.');
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
              <input
                className={field}
                placeholder="o pega una URL de imagen"
                value={form.image?.startsWith('data:') ? '(imagen subida)' : form.image || ''}
                readOnly={form.image?.startsWith('data:')}
                onChange={(e) => setForm({ ...form, image: e.target.value })}
              />
              {form.image?.startsWith('data:') && <button type="button" onClick={() => setForm((f) => ({ ...f, image: '' }))} className="text-xs text-neutral-500">Quitar foto subida</button>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-1">
              <span className="text-xs text-neutral-500">Código</span>
              <input className={field} value={form.id} disabled={!isNew} onChange={(e) => setForm({ ...form, id: e.target.value.toUpperCase() })} placeholder="M120" />
            </label>
            <label className="col-span-2">
              <span className="text-xs text-neutral-500">Tipo</span>
              <select
                className={field}
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value;
                  setForm((f) => ({ ...f, type, variants: isNew ? defaultVariants({ ...f, type }) : f.variants }));
                }}
              >
                <option value="DISEÑADOR">Diseñador</option>
                <option value="NICHO">Nicho</option>
                <option value="AUTOR">Autor</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-neutral-500">Nombre</span>
            <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">{form.type === 'AUTOR' ? 'Marca' : 'Inspirado en (marca)'}</span>
            <input className={field} value={form.brand || ''} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </label>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-neutral-500">Tamaños y precios (CLP)</span>
              <button
                onClick={() => setForm((f) => ({ ...f, variants: [...(f.variants || []), { size: '100ml', price: 0 }] }))}
                className="text-xs font-semibold text-mustard-600 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Agregar tamaño
              </button>
            </div>
            <div className="space-y-2">
              {(form.variants || []).map((v, idx) => (
                <div key={idx} className="flex gap-2">
                  <input className={field + ' w-28'} value={v.size} onChange={(e) => setVariant(idx, { size: e.target.value })} placeholder="60ml" />
                  <input
                    className={field}
                    inputMode="numeric"
                    value={v.price ? String(v.price) : ''}
                    onChange={(e) => setVariant(idx, { price: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0 })}
                    placeholder="15000"
                  />
                  <button
                    aria-label="Quitar tamaño"
                    onClick={() => setForm((f) => ({ ...f, variants: f.variants!.filter((_, i) => i !== idx) }))}
                    className="w-11 h-11 shrink-0 flex items-center justify-center text-neutral-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <label>
              <span className="text-xs text-neutral-500">Stock físico (unidades)</span>
              <input
                className={field}
                type="number"
                min={product.reservedCount ?? 0}
                max={9999}
                step={1}
                inputMode="numeric"
                value={form.stockCount ?? 0}
                onChange={(e) => setForm({ ...form, stockCount: parseInt(e.target.value, 10) || 0 })}
              />
              <p className="text-xs text-neutral-500 mt-1">{product.reservedCount ?? 0} reservadas · disponibles: {Math.max(0, (form.stockCount ?? 0) - (product.reservedCount ?? 0))}</p>
            </label>
            <label className="h-11 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.hidden} onChange={(e) => setForm({ ...form, hidden: e.target.checked })} className="w-5 h-5" />
              Ocultar de la tienda
            </label>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="p-4 border-t border-neutral-100 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button disabled={saving || uploading} onClick={save} className="w-full h-12 rounded-full bg-neutral-900 text-white font-semibold disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProductsTab() {
  const { refresh: refreshStore } = useProducts();
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'todos' | 'stock' | 'agotados' | 'ocultos'>('todos');
  const [editing, setEditing] = useState<{ product: Product; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState('');

  const loadProducts = useCallback(async (fresh = false) => {
    if (!fresh && activeRequest.current && !activeRequest.current.signal.aborted) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const list = await adminFetch<Product[]>('/api/admin/products', { signal: controller.signal });
      if (!Array.isArray(list)) throw new Error('El catálogo recibido no es válido.');
      if (controller.signal.aborted) return;
      setAllProducts(list.map((p) => ({ ...p, image: resolveImage(p.id, p.image) })).sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setError('');
    } catch (e) {
      if (controller.signal.aborted) return;
      setAllProducts([]);
      setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, []);

  const refresh = useCallback(async () => { await Promise.all([loadProducts(true), refreshStore()]); }, [loadProducts, refreshStore]);

  useEffect(() => {
    void loadProducts();
    const onVisible = () => { if (document.visibilityState === 'visible') void loadProducts(); };
    const interval = window.setInterval(onVisible, 5000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(interval); activeRequest.current?.abort(); document.removeEventListener('visibilitychange', onVisible); };
  }, [loadProducts]);

  // Records saved before sizes/variants existed (old 100ml pricing).
  const outdated = allProducts.filter((p) => !p.variants?.length);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return allProducts.filter((p) => {
      if (filter === 'stock' && (stockOf(p) <= 0 || p.hidden)) return false;
      if (filter === 'agotados' && stockOf(p) > 0) return false;
      if (filter === 'ocultos' && !p.hidden) return false;
      return !s || `${p.id} ${p.name} ${p.brand}`.toLowerCase().includes(s);
    });
  }, [allProducts, q, filter]);

  const setStock = async (p: Product, n: number) => {
    const count = Math.max(p.reservedCount ?? 0, n);
    setBusy(p.id);
    try {
      await updateProduct(p.id, { stockCount: count, expectedStockCount: p.stockCount ?? stockOf(p) });
      await refresh();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy('');
    }
  };

  const totals = {
    all: allProducts.length,
    inStock: allProducts.filter((p) => stockOf(p) > 0 && !p.hidden).length,
    units: allProducts.reduce((s, p) => s + (p.stockCount ?? stockOf(p)), 0),
  };

  const toggleHidden = async (p: Product) => {
    setBusy(p.id);
    try { await updateProduct(p.id, { hidden: !p.hidden }); await refresh(); }
    catch (e) { alert(e instanceof Error ? e.message : 'No se pudo cambiar la visibilidad.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">El catálogo se actualiza cada 5 segundos mientras esta pestaña está visible. Los cambios guardados se muestran de inmediato.</p>
      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg" role="alert">{error}</p>}
      {outdated.length > 0 && (
        <div className="bg-mustard-400/15 border border-mustard-400 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm flex-1">
            <strong>{outdated.length} productos</strong> aún tienen la lista de precios antigua guardada en la base de datos. La tienda ya muestra los
            nuevos precios (60ml: diseñador {formatCLP(15000)}, nicho {formatCLP(18000)}; Castagna y Monley 60/100ml), pero conviene guardarlos.
          </p>
          <button
            disabled={!!busy}
            onClick={async () => {
              if (!confirm('¿Aplicar la nueva lista de precios a TODOS los productos? Se reemplazan tamaños y precios.')) return;
              setBusy('prices');
              try {
                const n = await applyPriceList();
                await refresh();
                alert(`Listo: ${n} productos actualizados.`);
              } catch (e: any) {
                alert(e.message);
              } finally {
                setBusy('');
              }
            }}
            className="h-10 px-4 rounded-full bg-neutral-900 text-white text-sm font-semibold flex items-center gap-2 justify-center shrink-0"
          >
            <Tags className="w-4 h-4" /> Aplicar precios
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3 border border-neutral-200"><p className="text-xs text-neutral-500">Productos</p><p className="text-xl font-semibold">{totals.all}</p></div>
        <div className="bg-white rounded-xl p-3 border border-neutral-200"><p className="text-xs text-neutral-500">Con stock</p><p className="text-xl font-semibold">{totals.inStock}</p></div>
        <div className="bg-white rounded-xl p-3 border border-neutral-200"><p className="text-xs text-neutral-500">Unidades físicas</p><p className="text-xl font-semibold">{totals.units}</p></div>
      </div>

      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, marca o código" className="w-full h-10 pl-9 pr-3 rounded-full border border-neutral-200 bg-white text-base md:text-sm" />
        </label>
        <button
          aria-label="Nuevo producto"
          disabled={loading || !!error}
          onClick={() =>
            setEditing({
              isNew: true,
              product: { id: '', type: 'DISEÑADOR', name: '', brand: '', price: 0, displayPrice: '', size: '60ml', stock: 'AGOTADO', stockCount: 0, variants: defaultVariants({ id: '', type: 'DISEÑADOR', price: 0, size: '60ml' }) },
            })
          }
          className="h-10 px-4 rounded-full bg-neutral-900 text-white text-sm font-semibold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuevo</span>
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {([['todos', 'Todos'], ['stock', 'Con stock'], ['agotados', 'Agotados'], ['ocultos', 'Ocultos']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`shrink-0 h-9 px-4 rounded-full text-xs font-semibold border ${filter === id ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100">
        {list.map((p) => {
          const stock = stockOf(p);
          const physical = p.stockCount ?? stock;
          return (
            <div key={p.id} className={`flex items-center gap-3 p-3 ${p.hidden ? 'opacity-50' : ''}`}>
              <div className="w-12 h-14 rounded-md overflow-hidden bg-neutral-100 shrink-0">
                <ProductImage src={p.image} alt="" className="w-full h-full object-cover" />
              </div>
              <button onClick={() => setEditing({ product: p, isNew: false })} className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-sm truncate flex items-center gap-1">
                  {p.hidden && <EyeOff className="w-3.5 h-3.5" />} {p.name}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  <span className="font-mono">{p.id}</span> · {p.type} · {p.brand}
                </p>
                <p className="text-xs text-neutral-700">
                  {priceLabel(p)} · {sizesLabel(p)}
                </p>
                <p className="text-xs text-neutral-500">{p.reservedCount ?? 0} reservadas · {stock} disponibles</p>
              </button>
              <div className="flex items-center border border-neutral-200 rounded-full shrink-0">
                <button aria-label={`Restar stock ${p.id}`} disabled={busy === p.id || physical <= (p.reservedCount ?? 0)} onClick={() => setStock(p, physical - 1)} className="w-9 h-9 flex items-center justify-center disabled:opacity-30">
                  <Minus className="w-4 h-4" />
                </button>
                <span title="Stock físico" className={`w-7 text-center text-sm font-semibold ${stock <= 0 ? 'text-red-500' : ''}`}>{physical}</span>
                <button aria-label={`Sumar stock ${p.id}`} disabled={busy === p.id} onClick={() => setStock(p, physical + 1)} className="w-9 h-9 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <button aria-label={`${p.hidden ? 'Mostrar' : 'Ocultar'} ${p.id}`} disabled={busy === p.id} onClick={() => toggleHidden(p)} className="hidden sm:flex w-9 h-9 items-center justify-center text-neutral-400 disabled:opacity-30">
                {p.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button aria-label={`Editar ${p.id}`} onClick={() => setEditing({ product: p, isNew: false })} className="w-9 h-9 flex items-center justify-center text-neutral-500">
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        {!list.length && <p className="p-8 text-center text-neutral-400 text-sm">{loading ? 'Cargando productos…' : 'Sin resultados.'}</p>}
      </div>

      <button
        disabled={!!busy || loading || !!error}
        onClick={async () => {
          if (!confirm('¿Restaurar productos faltantes del catálogo base?')) return;
          setBusy('seed');
          try {
            const n = await seedProducts();
            await refresh();
            alert(n ? `Se agregaron ${n} productos del catálogo base.` : 'La base de datos ya está completa.');
          } catch (e) { alert(e instanceof Error ? e.message : 'No se pudo restaurar el catálogo.'); }
          finally { setBusy(''); }
        }}
        className="text-xs text-neutral-500 flex items-center gap-1.5 mx-auto"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Restaurar productos faltantes del catálogo base
      </button>

      {editing && <EditSheet product={editing.product} isNew={editing.isNew} allProducts={allProducts} onSaved={refresh} onClose={() => setEditing(null)} />}
    </div>
  );
}
