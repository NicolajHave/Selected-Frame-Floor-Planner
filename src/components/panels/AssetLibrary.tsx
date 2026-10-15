'use client';

import { clsx } from 'clsx';
import { ASSET_CATALOG, ASSET_CATEGORIES, type AssetEntry } from '@/lib/assetCatalog';
import { usePlannerStore } from '@/store/plannerStore';
import { formatLength } from '@/model/units';
import { OPENING_TYPES, type OpeningType } from '@/lib/openingTypes';
import type { OpeningKind } from '@/model/objects';

export function AssetLibrary() {
  const pendingAssetRef = usePlannerStore((s) => s.pendingAssetRef);
  const tool = usePlannerStore((s) => s.tool);
  const pickAsset = usePlannerStore((s) => s.pickAsset);
  const setTool = usePlannerStore((s) => s.setTool);
  const pendingOpening = usePlannerStore((s) => s.pendingOpening);
  const pickOpening = usePlannerStore((s) => s.pickOpening);

  const armed =
    (tool === 'add-inventory' && pendingAssetRef !== null) ||
    (tool === 'add-opening' && pendingOpening !== null);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-wall-200 px-5 py-4">
        <h3 className="text-[10px] font-medium uppercase tracking-widest2 text-ink-500">
          Library
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-ink-500">
          Click an item, then click the floor to place it. Wall units and logos snap to the
          nearest wall — hold Alt to place freely.
        </p>
        {armed && (
          <button
            onClick={() => setTool('select')}
            className="mt-2 text-[11px] text-ink-700 underline-offset-2 hover:underline"
          >
            Cancel placement
          </button>
        )}
      </div>

      <div className="flex flex-col overflow-y-auto p-3 pb-6">
        <section>
          <h4 className="px-1 pb-2 pt-1 text-[10px] font-medium uppercase tracking-widest2 text-ink-500">
            Doors &amp; windows
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {OPENING_TYPES.map((t) => (
              <OpeningCard
                key={t.kind}
                type={t}
                active={tool === 'add-opening' && pendingOpening === t.kind}
                onPick={() => pickOpening(t.kind)}
              />
            ))}
          </div>
        </section>

        {ASSET_CATEGORIES.map((category) => {
          const entries = ASSET_CATALOG.filter((a) => a.category === category);
          if (entries.length === 0) return null;
          return (
            <section key={category}>
              <h4 className="px-1 pb-2 pt-4 text-[10px] font-medium uppercase tracking-widest2 text-ink-500 first:pt-1">
                {category}
              </h4>
              <div className="flex flex-col gap-2">
                {entries.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    active={pendingAssetRef === asset.id}
                    onPick={() => pickAsset(asset.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface CardProps {
  asset: AssetEntry;
  active: boolean;
  onPick: () => void;
}

function AssetCard({ asset, active, onPick }: CardProps) {
  return (
    <button
      onClick={onPick}
      title={`Place ${asset.name}`}
      className={clsx(
        'group flex flex-col gap-2 rounded-[2px] border bg-wall-50 p-2 text-left transition-colors',
        active
          ? 'border-ink-900 bg-wall-100'
          : 'border-wall-200 hover:border-ink-500 hover:bg-wall-100',
      )}
    >
      <FootprintThumbnail asset={asset} active={active} />
      <div className="flex flex-col">
        <span className="truncate text-[12px] font-medium text-ink-900">{asset.name}</span>
        <span className="text-[10px] uppercase tracking-widest2 text-ink-500">{asset.id}</span>
        <span className="mt-1 font-mono text-[10px] text-ink-500">
          {formatLength(asset.size.width)} × {formatLength(asset.size.depth)} ×{' '}
          {formatLength(asset.size.height)}
        </span>
      </div>
    </button>
  );
}

/**
 * Top-down footprint preview. Width × depth, scaled to fit the card.
 * The 3D view renders the generated model; this stays schematic.
 */
function FootprintThumbnail({ asset, active }: { asset: AssetEntry; active: boolean }) {
  const PAD = 8;
  const BOX = 96;
  const w = asset.size.width as number;
  const d = asset.size.depth as number;
  const scale = (BOX - PAD * 2) / Math.max(w, d);
  const rectW = w * scale;
  const rectD = d * scale;
  const cx = BOX / 2;
  const cy = BOX / 2;

  return (
    <div className="relative flex h-24 w-full items-center justify-center rounded-[2px] bg-wall-100">
      <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} className="block">
        <rect
          x={cx - rectW / 2}
          y={cy - rectD / 2}
          width={rectW}
          height={rectD}
          fill="var(--inv-fill, #E8E5DE)"
          stroke={active ? 'var(--selection, #16181A)' : 'var(--inv-stroke, #737E62)'}
          strokeWidth={1}
        />
        <line
          x1={cx - rectW / 2}
          y1={cy - rectD / 2}
          x2={cx + rectW / 2}
          y2={cy + rectD / 2}
          stroke="var(--inv-stroke, #737E62)"
          strokeWidth={0.5}
          strokeDasharray="2 2"
          opacity={0.5}
        />
      </svg>
      <span className="absolute bottom-1 right-1 rounded-[2px] bg-wall-50 px-1 font-mono text-[9px] text-ink-500">
        3D
      </span>
    </div>
  );
}

function OpeningCard({ type, active, onPick }: { type: OpeningType; active: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      title={`Place ${type.name}`}
      className={clsx(
        'flex flex-col items-center gap-1 rounded-[2px] border bg-wall-50 px-2 py-2 text-center transition-colors',
        active ? 'border-ink-900 bg-wall-100' : 'border-wall-200 hover:border-ink-500 hover:bg-wall-100',
      )}
    >
      <OpeningIcon kind={type.kind} />
      <span className="text-[11px] font-medium text-ink-900">{type.name}</span>
      <span className="font-mono text-[9px] text-ink-500">{formatLength(type.width)}</span>
    </button>
  );
}

/** Plan symbol for each opening kind, on a 48 × 28 box with the wall along the bottom. */
function OpeningIcon({ kind }: { kind: OpeningKind }) {
  const wall = 'var(--wall-stroke, #16181A)';
  return (
    <svg width={48} height={28} viewBox="0 0 48 28" aria-hidden>
      <line x1={0} y1={26} x2={10} y2={26} stroke={wall} strokeWidth={2} />
      <line x1={38} y1={26} x2={48} y2={26} stroke={wall} strokeWidth={2} />
      {kind === 'door' && (
        <>
          <line x1={10} y1={26} x2={10} y2={2} stroke={wall} strokeWidth={1.5} />
          <path d="M 10 2 A 24 24 0 0 1 34 26" fill="none" stroke={wall} strokeWidth={1} strokeDasharray="2 1.5" />
        </>
      )}
      {kind === 'double-door' && (
        <>
          <line x1={10} y1={26} x2={10} y2={12} stroke={wall} strokeWidth={1.5} />
          <line x1={38} y1={26} x2={38} y2={12} stroke={wall} strokeWidth={1.5} />
          <path d="M 10 12 A 14 14 0 0 1 24 26 A 14 14 0 0 1 38 12" fill="none" stroke={wall} strokeWidth={1} strokeDasharray="2 1.5" />
        </>
      )}
      {kind === 'opening' && (
        <line x1={10} y1={26} x2={38} y2={26} stroke={wall} strokeWidth={1} strokeDasharray="3 2" />
      )}
      {kind === 'window' && (
        <>
          <line x1={10} y1={23.5} x2={38} y2={23.5} stroke={wall} strokeWidth={1} />
          <line x1={10} y1={26} x2={38} y2={26} stroke={wall} strokeWidth={1} />
        </>
      )}
    </svg>
  );
}
