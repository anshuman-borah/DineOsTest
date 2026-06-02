'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch, apiPut } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import {
  Building2, MapPin, FileText, CheckCircle2,
  ArrowRight, ChevronLeft, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Constants ──────────────────────────────────────────────────────────── */

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
  'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman & Nicobar Islands','Chandigarh','Delhi','Jammu & Kashmir',
  'Ladakh','Lakshadweep','Puducherry',
];

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const BUSINESS_TYPES = [
  { value: 'restaurant',      label: '🍽️ Restaurant / Dine-in' },
  { value: 'qsr',             label: '🍔 Quick Service / Fast Food' },
  { value: 'cafe',            label: '☕ Café / Bakery' },
  { value: 'cloud_kitchen',   label: '📦 Cloud Kitchen' },
  { value: 'hotel_restaurant',label: '🏨 Hotel with Restaurant' },
  { value: 'bar_lounge',      label: '🍸 Bar / Lounge' },
  { value: 'catering',        label: '🎪 Catering Service' },
];

/* ─── Steps ──────────────────────────────────────────────────────────────── */

const STEPS = [
  { id: 'business', label: 'Business',  icon: Building2 },
  { id: 'address',  label: 'Location',  icon: MapPin },
  { id: 'tax',      label: 'Tax & Legal', icon: FileText },
  { id: 'done',     label: 'Done!',     icon: CheckCircle2 },
];

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [step, setStep]   = useState(0);
  const [form, setForm]   = useState({
    // Step 1 — business
    businessType: '',
    // Step 2 — location
    addressLine1: '',
    city: '',
    state: '',
    pincode: '',
    // Step 3 — tax
    gstin: '',
    pan: '',
    fssaiNo: '',
    taxRegime: 'regular',
  });

  const [gstinError, setGstinError] = useState('');

  const patch = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  /* ── Query: load existing tenant profile ── */
  const { data: tenant } = useQuery({
    queryKey: ['tenant-profile'],
    queryFn: () => apiFetch('/api/v1/tenant').then((r) => r.data),
    staleTime: Infinity,
  });

  /* ── Mutation: save profile & mark onboarded ── */
  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, any>) =>
      apiPut('/api/v1/tenant', payload),
    onSuccess: () => {
      if (step === STEPS.length - 2) {
        // Moving to "done" step
        setStep(STEPS.length - 1);
      }
    },
    onError: () => toast.error('Could not save. Please try again.'),
  });

  /* ── Per-step data ── */
  const handleNext = async () => {
    if (step === 0) {
      // Business type step — save and move
      if (!form.businessType) {
        toast.error('Please select your business type');
        return;
      }
      await saveMutation.mutateAsync({ settings: { businessType: form.businessType } });
      setStep(1);
    } else if (step === 1) {
      // Address step
      if (!form.city || !form.state) {
        toast.error('City and state are required');
        return;
      }
      await saveMutation.mutateAsync({
        addressLine1: form.addressLine1,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
      });
      setStep(2);
    } else if (step === 2) {
      // Tax step — GSTIN optional but validate if provided
      if (form.gstin && !GSTIN_RE.test(form.gstin)) {
        setGstinError('Invalid GSTIN format');
        return;
      }
      setGstinError('');
      await saveMutation.mutateAsync({
        gstin: form.gstin || null,
        pan: form.pan || null,
        fssaiNo: form.fssaiNo || null,
        taxRegime: form.taxRegime,
        settings: {
          businessType: form.businessType,
          onboarded: true,
        },
      });
      // onSuccess will set step to 3 (done)
    }
  };

  const handleFinish = () => {
    router.replace('/executive');
  };

  const handleSkip = () => {
    // Allow skipping — just mark onboarded
    saveMutation.mutate({ settings: { onboarded: true } });
    router.replace('/executive');
  };

  const isBusy = saveMutation.isPending;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* ── Header ── */}
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500 mb-2">
            <span className="text-xl font-black text-slate-900">D</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome to Dine&amp;Stay OS!</h1>
          <p className="text-sm text-slate-900 dark:text-slate-400">
            Let&apos;s set up your account in under 2 minutes.
          </p>
        </div>

        {/* ── Step indicator ── */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {STEPS.map(({ id, label, icon: Icon }, i) => {
            const isDone    = i < step;
            const isActive  = i === step;
            return (
              <div key={id} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors',
                      isDone   ? 'bg-emerald-500 border-emerald-500 text-slate-900 dark:text-white' :
                      isActive ? 'bg-amber-500 border-amber-500 text-slate-900' :
                                 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600',
                    )}
                  >
                    {isDone ? <CheckCircle2 size={15} /> : <Icon size={15} />}
                  </div>
                  <span className={cn(
                    'text-[10px] font-medium whitespace-nowrap',
                    isActive ? 'text-amber-600 dark:text-amber-400' : isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600',
                  )}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn(
                    'w-12 h-0.5 mb-4 mx-1 transition-colors',
                    i < step ? 'bg-emerald-500' : 'bg-slate-50 dark:bg-slate-800',
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Step panels ── */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">

          {/* Step 0 — Business type */}
          {step === 0 && (
            <>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">What type of business are you?</h2>
                <p className="text-xs text-slate-900 dark:text-slate-500 mt-1">This helps us tailor the dashboard for you.</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {BUSINESS_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => patch('businessType', value)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border text-left text-sm transition-colors',
                      form.businessType === value
                        ? 'border-amber-500 bg-amber-100 dark:bg-amber-500/10 text-slate-900 dark:text-white'
                        : 'border-slate-300 dark:border-slate-700 hover:border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300',
                    )}
                  >
                    <span className="text-lg">{label.split(' ')[0]}</span>
                    <span>{label.split(' ').slice(1).join(' ')}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 1 — Address */}
          {step === 1 && (
            <>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Where is your business located?</h2>
                <p className="text-xs text-slate-900 dark:text-slate-500 mt-1">This appears on bills and GST invoices.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="label">Address (optional)</label>
                  <input
                    className="input"
                    placeholder="123, MG Road, Ground Floor"
                    value={form.addressLine1}
                    onChange={(e) => patch('addressLine1', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">City <span className="text-red-600 dark:text-red-400">*</span></label>
                    <input
                      className="input"
                      placeholder="Bengaluru"
                      value={form.city}
                      onChange={(e) => patch('city', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Pincode</label>
                    <input
                      className="input"
                      placeholder="560001"
                      maxLength={6}
                      value={form.pincode}
                      onChange={(e) => patch('pincode', e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">State <span className="text-red-600 dark:text-red-400">*</span></label>
                  <select
                    className="input"
                    value={form.state}
                    onChange={(e) => patch('state', e.target.value)}
                    required
                  >
                    <option value="">Select state…</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Step 2 — Tax & Legal */}
          {step === 2 && (
            <>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Tax &amp; legal details</h2>
                <p className="text-xs text-slate-900 dark:text-slate-500 mt-1">Required for GST-compliant invoicing. You can skip and add later in Settings.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="label">GSTIN (optional)</label>
                  <input
                    className={cn('input font-mono tracking-widest', gstinError && 'border-red-500')}
                    placeholder="29AABCT1332L1ZV"
                    value={form.gstin}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase().replace(/\s/g, '');
                      patch('gstin', v);
                      setGstinError(v && !GSTIN_RE.test(v) ? 'Invalid GSTIN format' : '');
                    }}
                    maxLength={15}
                  />
                  {gstinError ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{gstinError}</p>
                  ) : form.gstin && GSTIN_RE.test(form.gstin) ? (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                      <CheckCircle2 size={11} /> Valid GSTIN
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="label">PAN (optional)</label>
                  <input
                    className="input font-mono tracking-widest"
                    placeholder="AABCT1332L"
                    value={form.pan}
                    onChange={(e) => patch('pan', e.target.value.toUpperCase())}
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="label">FSSAI Licence No. (optional)</label>
                  <input
                    className="input"
                    placeholder="12345678901234"
                    value={form.fssaiNo}
                    onChange={(e) => patch('fssaiNo', e.target.value)}
                    maxLength={14}
                  />
                </div>
                <div>
                  <label className="label">GST Registration Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'regular',     label: 'Regular' },
                      { value: 'composition', label: 'Composition' },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => patch('taxRegime', value)}
                        className={cn(
                          'py-2 rounded-xl border text-sm font-medium transition-colors',
                          form.taxRegime === value
                            ? 'border-amber-500 bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300'
                            : 'border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-400 hover:border-slate-300 dark:border-slate-600',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 3 — Done */}
          {step === 3 && (
            <div className="text-center space-y-4 py-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">You&apos;re all set!</h2>
              <p className="text-sm text-slate-900 dark:text-slate-400 max-w-xs mx-auto">
                Your Dine&amp;Stay OS account is ready. Your 14-day trial has started — no credit card needed.
              </p>
              <div className="text-xs text-slate-600 space-y-1 pt-2">
                <p>✓ First branch created automatically</p>
                <p>✓ Starter plan activated (trial)</p>
                <p>✓ You are the account Owner</p>
              </div>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex items-center justify-between pt-2">
            {step > 0 && step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="btn-ghost flex items-center gap-1 text-sm"
              >
                <ChevronLeft size={14} /> Back
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3 ml-auto">
              {step < STEPS.length - 2 && (
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-xs text-slate-900 dark:text-slate-500 hover:text-slate-900 dark:text-slate-400 transition-colors"
                >
                  Skip setup
                </button>
              )}

              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={isBusy}
                  className="btn-primary flex items-center gap-2"
                >
                  {isBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                  {step === STEPS.length - 2 ? 'Finish setup' : 'Continue'}
                  {!isBusy && <ArrowRight size={14} />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinish}
                  className="btn-primary flex items-center gap-2"
                >
                  Go to Dashboard
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Trial badge ── */}
        {step < STEPS.length - 1 && (
          <p className="text-center text-xs text-slate-600 mt-4">
            🎉 14-day free trial · No credit card required
          </p>
        )}
      </div>
    </div>
  );
}
