'use client';

import { clsx } from 'clsx';
import { ASSET_CATALOG, type AssetEntry } from '@/lib/assetCatalog';
import { usePlannerStore } from '@/store/plannerStore';
import { formatLength } from '@/model/units';

export function AssetLibrary() {
  const pendingAssetRef = usePlannerStore((s) => s.pendingAssetRef);
  const tool = usePlannerStore((s) => s.tool);
  const pickAsset = usePlannerStore((s) => s.pickAsset);
  const setTool = usePlannerStore((s) => s.setTool);

  const armed = tool === 'add-inventory' && pendingAssetRef !== null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-wall-200 px-5 py-4">
        <h3 className="text-[10px] font-medium uppercase tracking-widest2 text-ink-500">
          Library
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-ink-500">
          Click an item, then click the canvas to place it.
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

      <div className="flex flex-col gap-2 overflow-y-auto p-3">
        {ASSET_CATALOG.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            active={pendingAssetRef === asset.id}
            onPick={() => pickAsset(asset.id)}
          />
        ))}
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
        <span className="text-[10px] uppercase tracking-widest2 text-ink-500">
          {asset.category}
        </span>
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
 * Height is annotated under the card; the 3D adapter will render the real mesh.
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
        STEP
      </span>
    </div>
  );
}
