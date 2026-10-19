import type { DialSlotLayout, Rect, VaultCrackerLayout } from './types';
import { clamp } from '../utils/math';

function makeRect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function createVaultCrackerLayout(width: number, height: number, dpr: number): VaultCrackerLayout {
  if (width >= height * 1.45) {
    const padding = clamp(Math.min(width, height) * 0.035, 8, 16);
    const dialGap = clamp(width * 0.012, 6, 10);
    const dialWidth = clamp((width * 0.34 - dialGap * 3 - 20) / 4, 32, 56);
    const dialHeight = clamp(height * 0.54, 44, 70);
    const digitRackHeight = dialHeight + 20;
    const digitRackWidth = dialWidth * 4 + dialGap * 3 + 20;
    const vaultRadius = Math.min(height * 0.34, width * 0.1, 48);
    const vaultCenterX = padding + vaultRadius + 12;
    const vaultCenterY = height / 2;
    const digitRackX = vaultCenterX + vaultRadius + 10;
    const digitRackY = (height - digitRackHeight) / 2;
    const dialSlots: DialSlotLayout[] = Array.from({ length: 4 }, (_, index) => {
      const x = digitRackX + 10 + index * (dialWidth + dialGap);
      const y = digitRackY + 10;
      return {
        x,
        y,
        width: dialWidth,
        height: dialHeight,
        centerX: x + dialWidth / 2,
        centerY: y + dialHeight / 2,
      };
    });
    const submitX = digitRackX + digitRackWidth + 10;
    const submitHeight = clamp(height * 0.36, 40, 48);

    return {
      width,
      height,
      dpr,
      padding,
      headerRect: makeRect(padding, padding, width - padding * 2, 0),
      vaultCenterX,
      vaultCenterY,
      vaultRadius,
      vaultInnerRadius: vaultRadius * 0.62,
      pressureRadius: vaultRadius + clamp(vaultRadius * 0.16, 12, 20),
      dialSlots,
      digitRackRect: makeRect(digitRackX, digitRackY, digitRackWidth, digitRackHeight),
      submitRect: makeRect(
        submitX,
        (height - submitHeight) / 2,
        Math.max(72, width - padding - submitX),
        submitHeight,
      ),
      historyRect: makeRect(padding, height - padding, width - padding * 2, 0),
    };
  }

  const padding = clamp(Math.min(width, height) * 0.035, 8, 24);
  const contentWidth = Math.max(180, width - padding * 2);
  const headerHeight = clamp(height * 0.12, 52, 92);
  const historyHeight = 0;
  const submitHeight = clamp(height * 0.075, 42, 60);
  const dialHeight = clamp(height * 0.13, 58, 92);
  const dialGap = clamp(contentWidth * 0.025, 8, 14);
  const dialWidth = clamp((contentWidth - dialGap * 3) / 4, 30, 70);
  const digitRackHeight = dialHeight + 24;
  const verticalGap = clamp(height * 0.018, 6, 12);
  const availableVaultHeight = Math.max(
    60,
    height - padding * 2 - headerHeight - historyHeight - submitHeight - digitRackHeight - verticalGap * 4,
  );
  const vaultRadius = Math.min(contentWidth * 0.29, availableVaultHeight * 0.46);
  const vaultCenterX = width / 2;
  const vaultCenterY = padding + headerHeight + verticalGap + vaultRadius;
  const pressureRadius = vaultRadius + clamp(vaultRadius * 0.16, 16, 24);
  const vaultInnerRadius = vaultRadius * 0.62;

  const digitRackWidth = dialWidth * 4 + dialGap * 3 + 24;
  const digitRackX = (width - digitRackWidth) / 2;
  const digitRackY = vaultCenterY + vaultRadius + verticalGap;
  const digitRackRect = makeRect(digitRackX, digitRackY, digitRackWidth, digitRackHeight);

  const dialSlots: DialSlotLayout[] = Array.from({ length: 4 }, (_, index) => {
    const x = digitRackX + 12 + index * (dialWidth + dialGap);
    const y = digitRackY + 14;
    return {
      x,
      y,
      width: dialWidth,
      height: dialHeight,
      centerX: x + dialWidth / 2,
      centerY: y + dialHeight / 2,
    };
  });

  const submitWidth = Math.min(contentWidth, 320);
  const submitRect = makeRect(
    (width - submitWidth) / 2,
    digitRackY + digitRackHeight + verticalGap,
    submitWidth,
    submitHeight,
  );

  const historyRect = makeRect(
    padding,
    height - padding,
    width - padding * 2,
    historyHeight,
  );

  return {
    width,
    height,
    dpr,
    padding,
    headerRect: makeRect(padding, padding, width - padding * 2, headerHeight),
    vaultCenterX,
    vaultCenterY,
    vaultRadius,
    vaultInnerRadius,
    pressureRadius,
    dialSlots,
    digitRackRect,
    submitRect,
    historyRect,
  };
}
