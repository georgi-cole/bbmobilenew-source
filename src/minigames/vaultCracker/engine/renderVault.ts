import type { DialSlotLayout, VaultCrackerLayout, VaultCrackerRuntimeState } from './types';
import { clamp } from '../utils/math';

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
  ctx.fill();
}

function renderDial(
  ctx: CanvasRenderingContext2D,
  slot: DialSlotLayout,
  digit: number,
  offset: number,
  glow: number,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(16, 10, 28, 0.94)';
  fillRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, 16);

  const glowGradient = ctx.createLinearGradient(slot.x, slot.y, slot.x, slot.y + slot.height);
  glowGradient.addColorStop(0, `rgba(196, 164, 255, ${0.22 + glow * 0.2})`);
  glowGradient.addColorStop(1, 'rgba(67, 40, 104, 0.22)');
  ctx.fillStyle = glowGradient;
  fillRoundedRect(ctx, slot.x + 2, slot.y + 2, slot.width - 4, slot.height - 4, 14);

  ctx.strokeStyle = `rgba(196, 164, 255, ${0.35 + glow * 0.35})`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(slot.x + 1.5, slot.y + 1.5, slot.width - 3, slot.height - 3);

  ctx.beginPath();
  ctx.rect(slot.x, slot.y, slot.width, slot.height);
  ctx.clip();

  const centerY = slot.centerY + offset;
  const previewGap = slot.height * 0.3;
  const digits = [((digit + 9) % 10), digit, ((digit + 1) % 10)];
  const offsets = [-previewGap, 0, previewGap];
  digits.forEach((value, index) => {
    const distanceFromCenter = Math.abs(offsets[index] + offset) / previewGap;
    const alpha = clamp(1 - distanceFromCenter * 0.6, 0.2, 1);
    const size = 26 - distanceFromCenter * 8;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = value === digit ? '#fffaff' : 'rgba(221, 205, 250, 0.58)';
    ctx.font = `700 ${size}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), slot.centerX, centerY + offsets[index]);
  });

  ctx.globalAlpha = 1;
  ctx.restore();
}

export function renderVault(
  ctx: CanvasRenderingContext2D,
  state: VaultCrackerRuntimeState,
  layout: VaultCrackerLayout,
): void {
  const rotation = state.successPulse * 0.28 + Math.sin(state.idleMotion * 0.0012) * 0.015;

  ctx.save();
  ctx.translate(layout.vaultCenterX, layout.vaultCenterY);
  ctx.rotate(rotation);

  const outerGradient = ctx.createRadialGradient(0, -layout.vaultRadius * 0.22, layout.vaultRadius * 0.1, 0, 0, layout.vaultRadius);
  outerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
  outerGradient.addColorStop(0.35, '#765e96');
  outerGradient.addColorStop(0.75, '#322442');
  outerGradient.addColorStop(1, '#140e1f');
  ctx.fillStyle = outerGradient;
  ctx.beginPath();
  ctx.arc(0, 0, layout.vaultRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(196, 164, 255, ${0.28 + state.glow * 0.38})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, layout.vaultRadius + 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(221, 205, 250, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 7]);
  ctx.beginPath();
  ctx.arc(0, 0, layout.vaultRadius * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#1b1228';
  ctx.beginPath();
  ctx.arc(0, 0, layout.vaultInnerRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(-rotation * 2.2 + state.successPulse * 0.42);
  for (let index = 0; index < 6; index += 1) {
    ctx.rotate((Math.PI * 2) / 6);
    ctx.fillStyle = 'rgba(221, 205, 250, 0.2)';
    fillRoundedRect(ctx, -6, -layout.vaultInnerRadius + 8, 12, layout.vaultInnerRadius * 0.58, 6);
  }
  ctx.restore();

  const coreGradient = ctx.createRadialGradient(0, -10, 2, 0, 0, layout.vaultInnerRadius * 0.52);
  coreGradient.addColorStop(0, '#fffaff');
  coreGradient.addColorStop(0.28, '#d5b6ff');
  coreGradient.addColorStop(0.65, '#49345f');
  coreGradient.addColorStop(1, '#100a19');
  ctx.fillStyle = coreGradient;
  ctx.beginPath();
  ctx.arc(0, 0, layout.vaultInnerRadius * 0.46, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.fillStyle = 'rgba(14, 9, 24, 0.94)';
  fillRoundedRect(
    ctx,
    layout.digitRackRect.x,
    layout.digitRackRect.y,
    layout.digitRackRect.width,
    layout.digitRackRect.height,
    24,
  );

  ctx.strokeStyle = 'rgba(192, 132, 252, 0.22)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    layout.digitRackRect.x + 1,
    layout.digitRackRect.y + 1,
    layout.digitRackRect.width - 2,
    layout.digitRackRect.height - 2,
  );

  state.dialAnimations.forEach((animation, index) => {
    renderDial(ctx, layout.dialSlots[index], state.digits[index], animation.offset, animation.glow);
  });
}
