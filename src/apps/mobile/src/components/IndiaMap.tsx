/**
 * An isometric, extruded map of India with a standing pin per artisan.
 *
 * Built as pure SVG rather than a tile map so one file serves both web and native.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { colors, radius, shadows, spacing, typography } from '../theme';
import { Avatar } from './Avatar';
import { avatarColorFor } from '../utils/avatarColor';

export type MapPoint = {
  id: string;
  name: string;
  village: string | null;
  lat: number;
  lon: number;
};

const BOUNDS = { latMin: 5, latMax: 38, lonMin: 65, lonMax: 100 };
const VIEW_W = 340;
const VIEW_H = 400;
const PAD = 16;

const TILT = 0.9;
const EXTRUSION_DEPTH = 16;

const LAND_TOP_LIGHT = '#6E9F79';
const LAND_TOP_DARK = colors.ok;
const LAND_SIDE = '#3A6246';

function project(lat: number, lon: number): { x: number; y: number } {
  const fx = (lon - BOUNDS.lonMin) / (BOUNDS.lonMax - BOUNDS.lonMin);
  const fy = (lat - BOUNDS.latMin) / (BOUNDS.latMax - BOUNDS.latMin);
  return {
    x: PAD + fx * (VIEW_W - PAD * 2),
    y: PAD + (1 - fy) * (VIEW_H - PAD * 2 - EXTRUSION_DEPTH) * TILT,
  };
}

// Traced clockwise from the Kashmir/Ladakh north tip.
const OUTLINE_LATLON: [number, number][] = [
  [35.3, 77.0],   // Siachen / northern Ladakh
  [34.0, 78.3],   // eastern Ladakh
  [32.3, 79.0],   // Himachal / Tibet border
  [30.6, 81.1],   // Uttarakhand / Nepal border
  [28.2, 83.9],   // Nepal border, west
  [27.0, 85.3],   // Nepal border, central
  [26.7, 88.1],   // Sikkim
  [26.9, 89.4],   // near Bhutan
  [26.4, 90.4],   // Assam, chicken-neck start
  [27.8, 92.1],   // Arunachal, north
  [28.4, 96.9],   // Arunachal, north-east tip
  [27.5, 97.4],   // Arunachal / Myanmar border
  [25.8, 95.3],   // Nagaland / Myanmar
  [23.9, 93.4],   // Manipur / Myanmar
  [22.2, 93.0],   // Mizoram, south
  [23.6, 91.4],   // Tripura / Bangladesh
  [24.4, 88.9],   // West Bengal / Bangladesh border
  [21.9, 89.0],   // Sundarbans delta
  [20.6, 86.9],   // Odisha coast
  [17.7, 83.3],   // Visakhapatnam
  [15.9, 80.4],   // Andhra coast
  [13.1, 80.3],   // Chennai
  [11.0, 79.8],   // Tamil Nadu coast
  [8.1, 77.6],    // Kanyakumari -- the southern tip
  [8.9, 76.6],    // Kerala south coast
  [10.0, 76.2],   // Kochi
  [11.9, 75.4],   // Kerala north coast
  [12.9, 74.8],   // Mangalore
  [15.3, 73.8],   // Goa
  [18.9, 72.8],   // Mumbai
  [20.7, 72.9],   // Surat / Daman
  [21.6, 72.2],   // Saurashtra, east
  [22.5, 69.6],   // Saurashtra, west (Dwarka)
  [23.2, 68.9],   // Kutch, south
  [24.3, 68.3],   // Kutch, north
  [25.9, 70.1],   // Rajasthan / Pakistan border, south
  [28.0, 70.2],   // Rajasthan / Pakistan border, north
  [30.9, 74.5],   // Punjab / Pakistan border
  [32.5, 74.8],   // Jammu
];

const OUTLINE_D =
  OUTLINE_LATLON.map(([lat, lon], i) => {
    const { x, y } = project(lat, lon);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ') + ' Z';

const CONTEXT_LABELS: { text: string; lat: number; lon: number; size: number }[] = [
  { text: 'PAKISTAN', lat: 29.0, lon: 66.6, size: 7 },
  { text: 'CHINA', lat: 35.6, lon: 87.0, size: 7 },
  { text: 'NEPAL', lat: 29.9, lon: 83.4, size: 6 },
  { text: 'MYANMAR', lat: 22.0, lon: 96.6, size: 7 },
  { text: 'ARABIAN SEA', lat: 15.5, lon: 67.4, size: 7 },
  { text: 'BAY OF BENGAL', lat: 16.0, lon: 90.8, size: 7 },
  { text: 'SRI LANKA', lat: 6.6, lon: 81.2, size: 6 },
  { text: 'INDIAN OCEAN', lat: 6.0, lon: 72.5, size: 7 },
];

const SRI_LANKA = project(8.0, 80.8);

const PIN_PATH =
  'M 0 0 C 0 0 9 -11 9 -17 A 9 9 0 1 0 -9 -17 C -9 -11 0 0 0 0 Z';

export function IndiaMap({ points }: { points: MapPoint[] }) {
  const [selected, setSelected] = useState<MapPoint | null>(null);

  return (
    <View style={styles.card}>
      <Svg width="100%" height={VIEW_H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
        <Defs>
          <LinearGradient id="landTop" x1="0" y1="0" x2="0.4" y2="1">
            <Stop offset="0" stopColor={LAND_TOP_LIGHT} />
            <Stop offset="1" stopColor={LAND_TOP_DARK} />
          </LinearGradient>
        </Defs>

        {CONTEXT_LABELS.map((label) => {
          const { x, y } = project(label.lat, label.lon);
          return (
            <SvgText
              key={label.text}
              x={x}
              y={y}
              fontSize={label.size}
              fill={colors.textMuted}
              opacity={0.75}
              textAnchor="middle"
              letterSpacing={1}
            >
              {label.text}
            </SvgText>
          );
        })}

        <Ellipse
          cx={SRI_LANKA.x}
          cy={SRI_LANKA.y}
          rx={7}
          ry={11}
          fill={LAND_SIDE}
          opacity={0.45}
        />

        {Array.from({ length: EXTRUSION_DEPTH }).map((_, i) => (
          <Path
            key={i}
            d={OUTLINE_D}
            fill={LAND_SIDE}
            translateY={EXTRUSION_DEPTH - i}
          />
        ))}

        <Path d={OUTLINE_D} fill="url(#landTop)" stroke={LAND_SIDE} strokeWidth={0.75} />

        {points.map((p) => {
          const { x, y } = project(p.lat, p.lon);
          const isSelected = selected?.id === p.id;
          const { bg } = avatarColorFor(p.name);
          const scale = isSelected ? 1.25 : 1;
          return (
            <G key={p.id} onPress={() => setSelected(isSelected ? null : p)}>
              <Ellipse cx={x} cy={y} rx={5} ry={2} fill="#000000" opacity={0.22} />
              <G x={x} y={y} scale={scale}>
                <Path d={PIN_PATH} fill={bg} stroke={colors.surface} strokeWidth={1.5} />
                <Ellipse cx={0} cy={-17} rx={3.4} ry={3.4} fill={colors.surface} />
              </G>
            </G>
          );
        })}
      </Svg>

      <View style={styles.titleStrip}>
        <Text style={styles.titleSmall}>MAP OF</Text>
        <View style={styles.titleRule} />
        <Text style={styles.titleBig}>INDIA</Text>
      </View>

      {selected ? (
        <Pressable style={styles.callout} onPress={() => setSelected(null)}>
          <Avatar name={selected.name} size={40} />
          <View style={styles.calloutText}>
            <Text style={styles.calloutName}>{selected.name}</Text>
            {selected.village ? (
              <Text style={styles.calloutVillage}>{selected.village}</Text>
            ) : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.soft,
  },
  titleStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  titleSmall: { ...typography.label, fontSize: 11, color: colors.textMuted, letterSpacing: 2 },
  titleRule: { width: 1, height: 22, backgroundColor: colors.border },
  titleBig: { ...typography.heading, color: colors.text, letterSpacing: 3 },
  callout: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    ...shadows.soft,
  },
  calloutText: { flex: 1 },
  calloutName: { ...typography.bodyBold, color: colors.text },
  calloutVillage: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
