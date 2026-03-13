'use client';

import { type ComponentType, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, FlaskConical, LineChart, Loader2, PackagePlus, ShieldAlert, Upload } from 'lucide-react';
import { Header } from '@/components/Header';
import { apiClient } from '@/lib/api';
import type {
  SellerAgentStrategy,
  SellerProductPayload,
  SellerSandboxResult,
  SellerWorkbenchData,
} from '@/types';

const SELLER_ID = 'demo_seller_001';

const STRATEGY_OPTIONS: Array<{ value: SellerAgentStrategy['negotiation_style']; label: string; helper: string }> = [
  { value: 'quick_close', label: 'Quick Close', helper: 'Fast conversion. Willing to move to guardrail quickly.' },
  { value: 'balanced', label: 'Balanced', helper: 'Steady concessions with margin protection.' },
  { value: 'hard_bargain', label: 'Hard Bargain', helper: 'Strong anchor and slower discount pace.' },
  { value: 'value_bundle', label: 'Value Bundle', helper: 'Prefer bundled value over direct discounting.' },
];

const EMPTY_PRODUCT: SellerProductPayload = {
  title: '',
  category: '',
  list_price: 0,
  floor_price: 0,
  currency: 'USD',
  inventory: 0,
  highlights: [],
  description: '',
  image_urls: [],
};

const PERSONA_OPTIONS: Array<{ value: 'auto' | 'bargain_hunter' | 'premium_decider' | 'hesitant_planner'; label: string; helper: string }> = [
  { value: 'auto', label: 'Auto Detect', helper: 'Infer buyer type from message and offer.' },
  { value: 'bargain_hunter', label: 'Bargain Hunter', helper: 'Price-sensitive buyer who pushes for deals.' },
  { value: 'premium_decider', label: 'Premium Decider', helper: 'Willing to pay for quality and speed.' },
  { value: 'hesitant_planner', label: 'Hesitant Planner', helper: 'Needs reassurance before committing.' },
];

const PERSONA_PRESETS: Array<{
  id: string;
  label: string;
  summary: string;
  persona_name: string;
  tone: string;
  opening_style: string;
  custom_prompt: string;
}> = [
  {
    id: 'warm_mentor',
    label: 'Warm Mentor',
    summary: 'Empathy first, then close with confidence.',
    persona_name: 'Warm Design Mentor',
    tone: 'Warm, consultative, and confident',
    opening_style: 'Confirm room style before recommending',
    custom_prompt: 'Lead with material quality, then offer bundle value.',
  },
  {
    id: 'premium_designer',
    label: 'Premium Designer',
    summary: 'High-end tone focused on craftsmanship.',
    persona_name: 'Premium Home Designer',
    tone: 'Elegant, precise, and design-forward',
    opening_style: 'Ask about style preference and room dimensions',
    custom_prompt: 'Highlight craftsmanship and durability before discussing discount.',
  },
  {
    id: 'fast_closer',
    label: 'Fast Closer',
    summary: 'Direct, practical, conversion oriented.',
    persona_name: 'Efficiency Sales Closer',
    tone: 'Direct, practical, and action-oriented',
    opening_style: 'Confirm budget and decision timeline in one question',
    custom_prompt: 'Prioritize fast conversion with clear call-to-action and next step.',
  },
];

const GUARDRAIL_PRESETS: Array<{ key: string; label: string; text: string }> = [
  { key: 'no_free_shipping', label: 'No free cross-country shipping promise', text: 'Never promise free cross-country shipping' },
  { key: 'no_competitor', label: 'No competitor disparagement', text: 'Do not disparage competitors' },
  { key: 'no_fake_inventory', label: 'No fake inventory claims', text: 'Do not claim inventory you cannot guarantee' },
];

export default function SellerWorkspacePage() {
  const [workbench, setWorkbench] = useState<SellerWorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [productForm, setProductForm] = useState<SellerProductPayload>(EMPTY_PRODUCT);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkWarnings, setBulkWarnings] = useState<string[]>([]);
  const [bulkParsed, setBulkParsed] = useState<SellerProductPayload[]>([]);

  const [strategy, setStrategy] = useState<SellerAgentStrategy | null>(null);
  const [sandboxProductId, setSandboxProductId] = useState('');
  const [sandboxMessage, setSandboxMessage] = useState('Can you do better if I buy today?');
  const [sandboxOffer, setSandboxOffer] = useState<number | undefined>(undefined);
  const [sandboxRound, setSandboxRound] = useState(1);
  const [sandboxPersona, setSandboxPersona] = useState<'auto' | 'bargain_hunter' | 'premium_decider' | 'hesitant_planner'>('auto');
  const [sandboxResult, setSandboxResult] = useState<SellerSandboxResult | null>(null);
  const [actionApplied, setActionApplied] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState('custom');
  const [upsellRules, setUpsellRules] = useState<string[]>([]);
  const [upsellWhen, setUpsellWhen] = useState('Sofa');
  const [upsellRecommend, setUpsellRecommend] = useState('Matching accessory bundle');
  const [guardrailFlags, setGuardrailFlags] = useState<Record<string, boolean>>({});
  const [guardrailInput, setGuardrailInput] = useState('');
  const [extraGuardrails, setExtraGuardrails] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.getSellerWorkbench(SELLER_ID);
      setWorkbench(result.data);
      setStrategy(result.data.strategy);
      if (result.data.products.length > 0) {
        setSandboxProductId(result.data.products[0].product_id);
      }
    } catch {
      setError('Failed to load seller workspace. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, []);

  useEffect(() => {
    if (!strategy) return;
    const matchedPreset = PERSONA_PRESETS.find(
      (preset) => preset.persona_name === strategy.persona_name && preset.tone === strategy.tone,
    );
    setSelectedPresetId(matchedPreset?.id || 'custom');

    const normalizedUpsell = (strategy.upsell_rule || '')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
    setUpsellRules(normalizedUpsell.length > 0 ? normalizedUpsell : strategy.upsell_rule ? [strategy.upsell_rule] : []);

    const presetFlags: Record<string, boolean> = {};
    const existingForbidden = [...strategy.forbidden_promises];
    GUARDRAIL_PRESETS.forEach((preset) => {
      const idx = existingForbidden.findIndex((item) => item === preset.text);
      presetFlags[preset.key] = idx >= 0;
      if (idx >= 0) existingForbidden.splice(idx, 1);
    });
    setGuardrailFlags(presetFlags);
    setExtraGuardrails(existingForbidden);
  }, [strategy]);

  const upsellCategoryOptions = useMemo(() => {
    const categories = new Set<string>(['Sofa', 'Bed', 'Dining Table', 'Desk']);
    workbench?.products.forEach((product) => {
      if (product.category?.trim()) categories.add(product.category.trim());
    });
    return Array.from(categories);
  }, [workbench]);

  const canCreateProduct = useMemo(() => {
    return (
      productForm.title.trim().length >= 2 &&
      productForm.category.trim().length >= 2 &&
      productForm.list_price > 0 &&
      productForm.floor_price > 0 &&
      productForm.floor_price <= productForm.list_price
    );
  }, [productForm]);

  const submitProduct = async () => {
    if (!canCreateProduct) return;
    setSaving(true);
    try {
      await apiClient.createSellerProduct(SELLER_ID, {
        ...productForm,
        highlights: productForm.highlights.filter(Boolean),
      });
      setProductForm(EMPTY_PRODUCT);
      await loadWorkbench();
    } finally {
      setSaving(false);
    }
  };

  const previewBulkParse = async () => {
    if (!bulkInput.trim()) return;
    setSaving(true);
    try {
      const res = await apiClient.parseSellerBulkProducts(SELLER_ID, bulkInput);
      setBulkParsed(res.data.parsed_products || []);
      setBulkWarnings(res.data.warnings || []);
    } finally {
      setSaving(false);
    }
  };

  const importParsedProducts = async () => {
    if (bulkParsed.length === 0) return;
    setSaving(true);
    try {
      for (const payload of bulkParsed) {
        await apiClient.createSellerProduct(SELLER_ID, payload);
      }
      setBulkInput('');
      setBulkParsed([]);
      setBulkWarnings([]);
      await loadWorkbench();
    } finally {
      setSaving(false);
    }
  };

  const saveStrategy = async () => {
    if (!strategy) return;

    const selectedGuardrails = GUARDRAIL_PRESETS.filter((preset) => guardrailFlags[preset.key]).map((preset) => preset.text);
    const mergedForbidden = [...selectedGuardrails, ...extraGuardrails.map((item) => item.trim()).filter(Boolean)];
    const mergedUpsellRule = upsellRules.map((item) => item.trim()).filter(Boolean).join(' | ');

    const payload: SellerAgentStrategy = {
      ...strategy,
      upsell_rule: mergedUpsellRule || strategy.upsell_rule,
      forbidden_promises: mergedForbidden,
    };

    setSaving(true);
    try {
      const response = await apiClient.updateSellerStrategy(SELLER_ID, payload);
      setStrategy(response.data);
      await loadWorkbench();
    } finally {
      setSaving(false);
    }
  };

  const applyPersonaPreset = (presetId: string) => {
    if (!strategy) return;
    if (presetId === 'custom') {
      setSelectedPresetId('custom');
      return;
    }
    const preset = PERSONA_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;

    setSelectedPresetId(presetId);
    setStrategy({
      ...strategy,
      persona_name: preset.persona_name,
      tone: preset.tone,
      opening_style: preset.opening_style,
      custom_prompt: preset.custom_prompt,
    });
  };

  const addUpsellRule = () => {
    const rule = `If buyer asks for ${upsellWhen}, recommend ${upsellRecommend}`.trim();
    if (!rule) return;
    if (upsellRules.includes(rule)) return;
    setUpsellRules((prev) => [...prev, rule]);
  };

  const addGuardrail = () => {
    const next = guardrailInput.trim();
    if (!next) return;
    if (extraGuardrails.includes(next)) return;
    setExtraGuardrails((prev) => [...prev, next]);
    setGuardrailInput('');
  };

  const runSandbox = async () => {
    if (!sandboxProductId || !sandboxMessage.trim()) return;
    setSaving(true);
    try {
      const response = await apiClient.simulateSeller(SELLER_ID, {
        seller_id: SELLER_ID,
        product_id: sandboxProductId,
        buyer_message: sandboxMessage,
        buyer_offer_price: sandboxOffer,
        round_index: sandboxRound,
        buyer_persona: sandboxPersona,
      });
      setSandboxResult(response.data);
      setActionApplied(false);
      await loadWorkbench();
    } finally {
      setSaving(false);
    }
  };

  const applyQuickAction = async () => {
    if (!strategy || !sandboxResult) return;
    const patch = sandboxResult.quick_action_patch || {};

    const nextStrategy: SellerAgentStrategy = {
      ...strategy,
      upsell_rule: strategy.upsell_rule,
      custom_prompt: strategy.custom_prompt,
      max_auto_discount_ratio: strategy.max_auto_discount_ratio,
    };

    const upsellAppend = patch.upsell_rule_append;
    if (typeof upsellAppend === 'string' && !nextStrategy.upsell_rule.includes(upsellAppend)) {
      nextStrategy.upsell_rule = `${nextStrategy.upsell_rule} ${upsellAppend}`.trim();
    }

    const promptAppend = patch.custom_prompt_append;
    if (typeof promptAppend === 'string' && !nextStrategy.custom_prompt.includes(promptAppend)) {
      nextStrategy.custom_prompt = `${nextStrategy.custom_prompt}\n${promptAppend}`.trim();
    }

    const maxDiscount = patch.max_auto_discount_ratio;
    if (typeof maxDiscount === 'number' && Number.isFinite(maxDiscount)) {
      nextStrategy.max_auto_discount_ratio = Math.max(0, Math.min(0.5, maxDiscount));
    }

    setSaving(true);
    try {
      const response = await apiClient.updateSellerStrategy(SELLER_ID, nextStrategy);
      setStrategy(response.data);
      setActionApplied(true);
      await loadWorkbench();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="flex h-[calc(100vh-64px)] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  if (error || !workbench || !strategy) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-rose-500" />
          <p className="mt-4 text-slate-700">{error || 'Unable to initialize the seller workspace.'}</p>
          <button
            onClick={() => void loadWorkbench()}
            className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40">
      <Header />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Seller Workspace</h1>
              <p className="mt-1 text-sm text-slate-600">Upload products, configure your seller agent strategy, and test conversations before going live.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Products" value={workbench.insights.total_products} icon={PackagePlus} />
              <Stat label="Active" value={workbench.insights.active_products} icon={CheckCircle2} />
              <Stat label="Sandbox Runs" value={workbench.insights.sandbox_runs} icon={FlaskConical} />
              <Stat label="Acceptance" value={`${Math.round(workbench.insights.acceptance_rate * 100)}%`} icon={LineChart} />
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Smart Product Upload</h2>
            <p className="mt-1 text-sm text-slate-500">Friendly form for single product creation.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Product title" value={productForm.title} onChange={(e) => setProductForm((p) => ({ ...p, title: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Category" value={productForm.category} onChange={(e) => setProductForm((p) => ({ ...p, category: e.target.value }))} />
              <input type="number" min={0} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="List price" value={productForm.list_price || ''} onChange={(e) => setProductForm((p) => ({ ...p, list_price: Number(e.target.value) || 0 }))} />
              <input type="number" min={0} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Floor price" value={productForm.floor_price || ''} onChange={(e) => setProductForm((p) => ({ ...p, floor_price: Number(e.target.value) || 0 }))} />
              <input type="number" min={0} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Inventory" value={productForm.inventory || ''} onChange={(e) => setProductForm((p) => ({ ...p, inventory: Number(e.target.value) || 0 }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Currency (USD)" value={productForm.currency} onChange={(e) => setProductForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} />
            </div>
            <input className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Highlights, comma-separated" value={productForm.highlights.join(', ')} onChange={(e) => setProductForm((p) => ({ ...p, highlights: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) }))} />
            <textarea className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={3} placeholder="Description" value={productForm.description || ''} onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))} />
            <button
              onClick={() => void submitProduct()}
              disabled={!canCreateProduct || saving}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Add Product
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Bulk Upload Assistant</h2>
            <p className="mt-1 text-sm text-slate-500">Paste one product per line: <code>title | category | list_price | floor_price | inventory | highlights</code></p>
            <textarea
              className="mt-3 h-36 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="Premium Sofa | Living Room | 1299 | 999 | 12 | washable fabric, anti-scratch"
            />
            <div className="mt-3 flex gap-2">
              <button onClick={() => void previewBulkParse()} disabled={!bulkInput.trim() || saving} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">Preview Parse</button>
              <button onClick={() => void importParsedProducts()} disabled={bulkParsed.length === 0 || saving} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Import Parsed Products</button>
            </div>
            {bulkWarnings.length > 0 && (
              <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                {bulkWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
            {bulkParsed.length > 0 && (
              <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
                Parsed {bulkParsed.length} products successfully.
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Bot className="h-5 w-5 text-indigo-600" />Agent Strategy Center</h2>
            <p className="mt-1 text-sm text-slate-500">Choose a sales persona, configure upsell playbooks, and set red-line guardrails without writing prompts.</p>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-medium text-slate-600">1) Sales persona template</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {PERSONA_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => applyPersonaPreset(preset.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs ${selectedPresetId === preset.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700'}`}
                    >
                      <p className="font-semibold">{preset.label}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{preset.summary}</p>
                    </button>
                  ))}
                  <button
                    onClick={() => applyPersonaPreset('custom')}
                    className={`rounded-xl border px-3 py-2 text-left text-xs ${selectedPresetId === 'custom' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700'}`}
                  >
                    <p className="font-semibold">Custom</p>
                    <p className="mt-1 text-[11px] text-slate-500">Manually tune in Advanced Settings.</p>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <p><span className="font-semibold">Persona:</span> {strategy.persona_name}</p>
                <p className="mt-1"><span className="font-semibold">Tone:</span> {strategy.tone}</p>
                <p className="mt-1"><span className="font-semibold">Opening:</span> {strategy.opening_style}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-600">2) Upsell playbook builder</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={upsellWhen} onChange={(e) => setUpsellWhen(e.target.value)}>
                    {upsellCategoryOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={upsellRecommend} onChange={(e) => setUpsellRecommend(e.target.value)} placeholder="Recommend what" />
                  <button onClick={addUpsellRule} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">Add Rule</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {upsellRules.length === 0 && <p className="text-xs text-slate-500">No upsell rules yet.</p>}
                  {upsellRules.map((rule, idx) => (
                    <span key={`${rule}-${idx}`} className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
                      {rule}
                      <button onClick={() => setUpsellRules((prev) => prev.filter((_, i) => i !== idx))} className="text-indigo-500">x</button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-600">3) Guardrails (red lines)</p>
                <div className="mt-2 space-y-2 rounded-xl border border-slate-200 p-3">
                  {GUARDRAIL_PRESETS.map((preset) => (
                    <label key={preset.key} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(guardrailFlags[preset.key])}
                        onChange={(e) => setGuardrailFlags((prev) => ({ ...prev, [preset.key]: e.target.checked }))}
                      />
                      {preset.label}
                    </label>
                  ))}

                  <div className="flex gap-2">
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={guardrailInput}
                      onChange={(e) => setGuardrailInput(e.target.value)}
                      placeholder="Add custom red line"
                    />
                    <button onClick={addGuardrail} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">Add</button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {extraGuardrails.map((rule, idx) => (
                      <span key={`${rule}-${idx}`} className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-700">
                        {rule}
                        <button onClick={() => setExtraGuardrails((prev) => prev.filter((_, i) => i !== idx))} className="text-rose-500">x</button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <button onClick={() => setShowAdvanced((prev) => !prev)} className="text-xs font-medium text-slate-700">
                  {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
                </button>
                {showAdvanced && (
                  <div className="mt-3 space-y-3">
                    <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={strategy.persona_name} onChange={(e) => setStrategy((s) => (s ? { ...s, persona_name: e.target.value } : s))} placeholder="Persona name" />
                    <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={strategy.tone} onChange={(e) => setStrategy((s) => (s ? { ...s, tone: e.target.value } : s))} placeholder="Tone" />
                    <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={strategy.opening_style} onChange={(e) => setStrategy((s) => (s ? { ...s, opening_style: e.target.value } : s))} placeholder="Opening style" />
                    <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={3} value={strategy.custom_prompt} onChange={(e) => setStrategy((s) => (s ? { ...s, custom_prompt: e.target.value } : s))} placeholder="Custom prompt" />
                  </div>
                )}
              </div>

              <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={strategy.negotiation_style} onChange={(e) => setStrategy((s) => (s ? { ...s, negotiation_style: e.target.value as SellerAgentStrategy['negotiation_style'] } : s))}>
                {STRATEGY_OPTIONS.map((opt) => (
                  <option value={opt.value} key={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500">{STRATEGY_OPTIONS.find((opt) => opt.value === strategy.negotiation_style)?.helper}</p>

              <label className="text-xs font-medium text-slate-600">Max auto discount ratio: {Math.round(strategy.max_auto_discount_ratio * 100)}%</label>
              <input type="range" min={0} max={0.4} step={0.01} value={strategy.max_auto_discount_ratio} onChange={(e) => setStrategy((s) => (s ? { ...s, max_auto_discount_ratio: Number(e.target.value) } : s))} className="w-full" />
            </div>
            <button onClick={() => void saveStrategy()} disabled={saving} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save Strategy</button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><FlaskConical className="h-5 w-5 text-emerald-600" />Seller Sandbox</h2>
            <p className="mt-1 text-sm text-slate-500">Test buyer conversations before publishing your strategy.</p>

            <div className="mt-4 space-y-3">
              <select value={sandboxProductId} onChange={(e) => setSandboxProductId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                {workbench.products.map((product) => (
                  <option key={product.product_id} value={product.product_id}>{product.title}</option>
                ))}
              </select>
              <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={3} value={sandboxMessage} onChange={(e) => setSandboxMessage(e.target.value)} placeholder="Buyer message" />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" min={0} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Buyer offer (optional)" value={sandboxOffer ?? ''} onChange={(e) => setSandboxOffer(e.target.value ? Number(e.target.value) : undefined)} />
                <input type="number" min={1} max={6} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={sandboxRound} onChange={(e) => setSandboxRound(Math.max(1, Math.min(6, Number(e.target.value) || 1)))} />
              </div>
              <select value={sandboxPersona} onChange={(e) => setSandboxPersona(e.target.value as 'auto' | 'bargain_hunter' | 'premium_decider' | 'hesitant_planner')} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                {PERSONA_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500">{PERSONA_OPTIONS.find((opt) => opt.value === sandboxPersona)?.helper}</p>
              <button onClick={() => void runSandbox()} disabled={!sandboxProductId || saving} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Run Simulation</button>
            </div>

            {sandboxResult && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                <p className="font-semibold text-slate-900">Agent Reply</p>
                <p className="mt-1 text-slate-700">{sandboxResult.seller_reply}</p>
                <p className="mt-2 text-xs text-slate-600">
                  Counter Price: {sandboxResult.counter_price ?? 'N/A'} | Discount: {Math.round(sandboxResult.discount_ratio * 100)}% | Persona: {sandboxResult.buyer_persona}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  Win Probability: {Math.round(sandboxResult.win_probability * 100)}% | Predicted Cart: {sandboxResult.predicted_cart_value.toFixed(2)} | Guardrail Buffer: {sandboxResult.guardrail_buffer.toFixed(2)}
                </p>
                <div className="mt-3 rounded-lg border border-emerald-300 bg-white/70 p-3">
                  <p className="text-xs font-semibold text-emerald-800">Coach Insight</p>
                  <p className="mt-1 text-xs text-emerald-700">{sandboxResult.coaching_tip}</p>
                  <p className="mt-1 text-xs text-emerald-700">Optimization: {sandboxResult.optimization_tip}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => void applyQuickAction()}
                      disabled={saving || actionApplied}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {actionApplied ? 'Applied' : sandboxResult.quick_action_label}
                    </button>
                    <span className="text-[11px] text-emerald-700">Action Code: {sandboxResult.quick_action_code}</span>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold text-slate-800">Alternative Strategy ({sandboxResult.alternative_strategy})</p>
                  <p className="mt-1 text-xs text-slate-700">{sandboxResult.alternative_reply}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Alt Win Probability: {Math.round(sandboxResult.alternative_win_probability * 100)}% | Risk Note: {sandboxResult.alternative_risk_note}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Live Product List</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">List Price</th>
                  <th className="px-3 py-2 font-medium">Floor Price</th>
                  <th className="px-3 py-2 font-medium">Inventory</th>
                </tr>
              </thead>
              <tbody>
                {workbench.products.map((product) => (
                  <tr key={product.product_id} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-800">{product.title}</td>
                    <td className="px-3 py-2 text-slate-600">{product.category}</td>
                    <td className="px-3 py-2 text-slate-600">{product.currency} {product.list_price.toFixed(2)}</td>
                    <td className="px-3 py-2 text-slate-600">{product.currency} {product.floor_price.toFixed(2)}</td>
                    <td className="px-3 py-2 text-slate-600">{product.inventory}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
