import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiCreateListing, apiUpdateListing } from '../../api/agent';
import { apiGetListing } from '../../api/listings';
import { checkImage, uploadImage } from '../../api/upload';
import { buildListingInput, emptyForm, listingToForm, type FormErrors, type ListingForm } from '../../lib/listingForm';
import type { PropertyType } from '../../types';

// The map is large. Load it only when this page opens.
const MapPicker = lazy(() => import('../../components/MapPicker'));

const TYPES: PropertyType[] = ['House', 'Apartment', 'Villa', 'Land', 'Commercial'];
const PROFILE_KEY = 'rofo.agent.profile';

/** Remember agency and phone so the next listing is prefilled. */
const loadProfile = (): { agency?: string; phone?: string } => {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}'); } catch { return {}; }
};

/** A labelled field with its error message. */
function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <label className={`field${error ? ' has-error' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && !error && <small className="muted">{hint}</small>}
      {error && <small className="field-error" role="alert">{error}</small>}
    </label>
  );
}

/** Create or edit a listing. Route /agent/new or /agent/:id/edit. */
export function ListingEditor() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<ListingForm>(() => emptyForm(loadProfile()));
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0); // files in flight
  const fileInput = useRef<HTMLInputElement>(null);

  // Editing: load the listing into the form.
  useEffect(() => {
    if (!id) return;
    apiGetListing(id)
      .then((l) => { if (l) setForm(listingToForm(l)); else setBanner('Listing not found'); })
      .catch((e: Error) => setBanner(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  /** Update one field and clear its error. */
  const set = <K extends keyof ListingForm>(k: K, v: ListingForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const text = (k: keyof ListingForm) => ({
    value: form[k] as string,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never),
  });

  /** Upload chosen photos one by one. Failures are reported per file and do not stop the rest. */
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBanner(null);
    const list = Array.from(files).slice(0, Math.max(0, 20 - form.images.length));
    for (const file of list) {
      const problem = checkImage(file);
      if (problem) { setBanner(problem); continue; }
      setUploading((n) => n + 1);
      try {
        const key = await uploadImage(file);
        const preview = URL.createObjectURL(file);
        setForm((f) => ({ ...f, images: [...f.images, { key, preview }] }));
      } catch (e) {
        setBanner((e as Error).message);
      } finally { setUploading((n) => n - 1); }
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const removePhoto = (key: string) => setForm((f) => ({ ...f, images: f.images.filter((i) => i.key !== key) }));
  const makeCover = (key: string) =>
    setForm((f) => ({ ...f, images: [...f.images.filter((i) => i.key === key), ...f.images.filter((i) => i.key !== key)] }));

  /** Validate, save, then go back to the dashboard. */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = buildListingInput(form);
    if (!res.ok) {
      setErrors(res.errors);
      setBanner('Fix the highlighted fields.');
      document.querySelector('.has-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (uploading > 0) { setBanner('Wait for the photos to finish uploading.'); return; }
    setSaving(true); setBanner(null);
    try {
      if (id) await apiUpdateListing(id, res.input); else await apiCreateListing(res.input);
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ agency: res.input.agency, phone: res.input.phone }));
      navigate('/agent');
    } catch (err) {
      setBanner((err as Error).message);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="container detail"><p className="muted">Loading listing...</p></div>;

  const lat = form.lat.trim() === '' || !Number.isFinite(Number(form.lat)) ? null : Number(form.lat);
  const lng = form.lng.trim() === '' || !Number.isFinite(Number(form.lng)) ? null : Number(form.lng);
  const isLand = form.type === 'Land';

  return (
    <div className="container detail">
      <Link to="/agent" className="back">← Your listings</Link>
      <h1>{editing ? 'Edit listing' : 'New listing'}</h1>

      <form className="editor" onSubmit={(e) => void submit(e)} noValidate>
        {banner && <div className="notice" role="alert">{banner}</div>}

        <section className="form-card wide">
          <h3>Basics</h3>
          <div className="grid-2">
            <Field label="Listing type">
              <select value={form.deal} onChange={(e) => set('deal', e.target.value as 'buy' | 'rent')}>
                <option value="buy">For sale</option><option value="rent">For rent</option>
              </select>
            </Field>
            <Field label="Property type">
              <select value={form.type} onChange={(e) => set('type', e.target.value as PropertyType)}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Headline" error={errors.title}><input {...text('title')} maxLength={140} placeholder="Bright 3 bedroom home near the park" /></Field>
          <Field label="Description" error={errors.description} hint="At least 10 characters.">
            <textarea {...text('description')} rows={5} maxLength={5000} />
          </Field>
          <Field label="Features" error={errors.features} hint="Comma separated. Example: Pool, Garage, Solar panels">
            <input {...text('features')} />
          </Field>
        </section>

        <section className="form-card wide">
          <h3>Location</h3>
          <Field label="Address" error={errors.address}><input {...text('address')} maxLength={140} /></Field>
          <div className="grid-2">
            <Field label="City" error={errors.city}><input {...text('city')} maxLength={80} /></Field>
            <Field label="Country" error={errors.country}><input {...text('country')} maxLength={80} /></Field>
          </div>
          <p className="muted small">Click the map or drag the pin to set the exact spot. Without a pin the listing will not show on the map.</p>
          <Suspense fallback={<div className="map-gl picker map-loading">Loading map...</div>}>
            <MapPicker lat={lat} lng={lng} onChange={(a, b) => { set('lat', String(a)); set('lng', String(b)); }} />
          </Suspense>
          <div className="grid-2">
            <Field label="Latitude" error={errors.lat}><input {...text('lat')} inputMode="decimal" /></Field>
            <Field label="Longitude" error={errors.lng}><input {...text('lng')} inputMode="decimal" /></Field>
          </div>
        </section>

        <section className="form-card wide">
          <h3>Details</h3>
          <div className="grid-2">
            <Field label={form.deal === 'rent' ? 'Rent per month (USD)' : 'Price (USD)'} error={errors.price}>
              <input {...text('price')} inputMode="decimal" />
            </Field>
            <Field label="Year built" error={errors.yearBuilt}><input {...text('yearBuilt')} inputMode="numeric" /></Field>
            {!isLand && <Field label="Bedrooms" error={errors.beds}><input {...text('beds')} inputMode="numeric" /></Field>}
            {!isLand && <Field label="Bathrooms" error={errors.baths}><input {...text('baths')} inputMode="numeric" /></Field>}
            {!isLand && <Field label="Living area (m²)" error={errors.areaM2}><input {...text('areaM2')} inputMode="numeric" /></Field>}
            <Field label="Plot size (m²)" error={errors.plotM2}><input {...text('plotM2')} inputMode="numeric" /></Field>
          </div>
          <div className="grid-2">
            <Field label="Open house" hint="Optional. Example: Sat 11:00 - 13:00"><input {...text('openHouse')} maxLength={80} /></Field>
            <label className="check"><input type="checkbox" checked={form.isNew} onChange={(e) => set('isNew', e.target.checked)} /> Mark as new</label>
          </div>
        </section>

        <section className="form-card wide">
          <h3>Photos</h3>
          <p className="muted small">JPEG, PNG or WebP, up to 8 MB each. The first photo is the cover.</p>
          <div className="photos">
            {form.images.map((img, i) => (
              <figure key={img.key} className="photo">
                <div className="photo-img" style={{ backgroundImage: img.preview ? `url("${img.preview}")` : undefined }} />
                <figcaption>
                  {i === 0 ? <span className="chip-status">Cover</span> : <button type="button" className="btn btn-ghost" onClick={() => makeCover(img.key)}>Make cover</button>}
                  <button type="button" className="btn btn-ghost" onClick={() => removePhoto(img.key)} aria-label={`Remove photo ${i + 1}`}>Remove</button>
                </figcaption>
              </figure>
            ))}
            {uploading > 0 && <div className="photo uploading">Uploading {uploading}...</div>}
          </div>
          {errors.images && <small className="field-error" role="alert">{errors.images}</small>}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
            onChange={(e) => void addPhotos(e.target.files)} data-testid="photo-input" />
          <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()} disabled={form.images.length >= 20}>
            Add photos
          </button>
        </section>

        <section className="form-card wide">
          <h3>Contact shown on the listing</h3>
          <div className="grid-2">
            <Field label="Agency" error={errors.agency}><input {...text('agency')} maxLength={100} /></Field>
            <Field label="Phone" error={errors.phone}><input {...text('phone')} maxLength={30} inputMode="tel" /></Field>
          </div>
        </section>

        <div className="editor-actions">
          <Link to="/agent" className="btn btn-ghost">Cancel</Link>
          <button className="btn btn-primary btn-lg" type="submit" disabled={saving || uploading > 0}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Publish listing'}
          </button>
        </div>
      </form>
    </div>
  );
}
