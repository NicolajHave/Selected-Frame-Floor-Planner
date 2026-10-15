'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { degToRad, mm, radToDeg } from '@/model/units';
import { Section } from '../ui/Section';
import { NumberField } from '../ui/NumberField';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';
import { findAsset } from '@/lib/assetCatalog';
import { wallHeightNear } from '@/geometry/wallStyle';
import { rackAssets, rackSummary } from '@/lib/racks';
import { ObjectIssues } from './LayoutCheckSection';

export function InventoryProperties({ id }: { id: string }) {
  const item = usePlannerStore((s) => s.project.inventory.find((i) => i.id === id));
  const updateInventory = usePlannerStore((s) => s.updateInventory);
  const duplicate = usePlannerStore((s) => s.duplicateSelected);
  const remove = usePlannerStore((s) => s.deleteSelected);
  const room = usePlannerStore((s) => s.project.room);

  const openRackBuilder = usePlannerStore((s) => s.openRackBuilder);
  if (!item) return null;
  const asset = findAsset(item.assetRef);
  const rack = item.modules?.length ? item.modules : null;

  return (
    <div className="flex h-full flex-col">
      <Section title="Inventory">
        <TextField
          label="Name"
          value={item.name}
          onCommit={(v) => updateInventory(id, { name: v })}
        />
        <TextField
          label="Category"
          value={item.category ?? ''}
          onCommit={(v) => updateInventory(id, { category: v || undefined })}
        />
        {item.assetRef && (
          <p className="font-mono text-[10px] uppercase tracking-widest2 text-ink-500">
            3D · {item.assetRef}
          </p>
        )}
        <p className="text-[11px] text-ink-500 font-mono">{item.id}</p>
        <ObjectIssues id={id} />
        {asset?.minWallHeight !== undefined && (
          <MountingNote
            mountHeight={asset.mountHeight}
            minWallHeight={asset.minWallHeight}
            wallHeight={room ? wallHeightNear(room, item.position) : undefined}
          />
        )}
      </Section>

      <div className="h-px bg-wall-200" />

      {rack && (
        <>
          <Section title="Wall rack">
            <ol className="flex flex-col gap-0.5 text-[12px] text-ink-900" data-testid="rack-units">
              {rackAssets(rack).map((a, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">
                    <span className="mr-1 font-mono text-ink-500">{i + 1}</span>
                    {a.name}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-500">{a.itemNumber}</span>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-ink-500">
              {rackSummary(rack).hangers} hangers · {rackSummary(rack).weightKg.toLocaleString('da-DK', { maximumFractionDigits: 1 })} kg
            </p>
            <Button variant="subtle" className="justify-center" onClick={() => openRackBuilder(item.id)}>
              Edit rack…
            </Button>
          </Section>
          <div className="h-px bg-wall-200" />
        </>
      )}

      {!rack && (
        <Section title="Dimensions">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Width"
              unit="mm"
              value={item.size.width}
              step={10}
              min={20}
              onCommit={(v) => updateInventory(id, { size: { ...item.size, width: mm(v) } })}
            />
            <NumberField
              label="Depth"
              unit="mm"
              value={item.size.depth}
              step={10}
              min={20}
              onCommit={(v) => updateInventory(id, { size: { ...item.size, depth: mm(v) } })}
            />
          </div>
          <NumberField
            label="Height"
            unit="mm"
            value={item.size.height}
            step={10}
            min={20}
            onCommit={(v) => updateInventory(id, { size: { ...item.size, height: mm(v) } })}
          />
        </Section>
      )}

      <div className="h-px bg-wall-200" />

      <Section title="Position & rotation">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="X"
            unit="mm"
            value={item.position.x}
            step={10}
            onCommit={(v) => updateInventory(id, { position: { ...item.position, x: mm(v) } })}
          />
          <NumberField
            label="Y"
            unit="mm"
            value={item.position.y}
            step={10}
            onCommit={(v) => updateInventory(id, { position: { ...item.position, y: mm(v) } })}
          />
        </div>
        <NumberField
          label="Rotation"
          unit="°"
          value={radToDeg(item.rotation)}
          step={5}
          onCommit={(v) => updateInventory(id, { rotation: degToRad(v) })}
        />
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Actions">
        <div className="flex gap-2">
          <Button variant="subtle" onClick={duplicate} className="flex-1 justify-center">
            Duplicate
          </Button>
          <Button variant="subtle" onClick={remove} className="flex-1 justify-center">
            Delete
          </Button>
        </div>
      </Section>
    </div>
  );
}

function MountingNote({
  mountHeight,
  minWallHeight,
  wallHeight,
}: {
  mountHeight?: number;
  minWallHeight: number;
  wallHeight?: number;
}) {
  const tooLow = wallHeight !== undefined && wallHeight < minWallHeight;
  const m = (n: number) => `${(n / 1000).toFixed(1)} m`;
  return (
    <p
      className={
        tooLow
          ? 'rounded-[2px] border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-950'
          : 'rounded-[2px] border border-wall-200 bg-wall-100 px-3 py-2 text-[11px] leading-relaxed text-ink-700'
      }
    >
      {mountHeight !== undefined && <>Hangs with its bottom edge at {m(mountHeight)}. </>}
      Walls must be at least {m(minWallHeight)} high.
      {tooLow && <> This wall is only {m(wallHeight)}.</>}
    </p>
  );
}
