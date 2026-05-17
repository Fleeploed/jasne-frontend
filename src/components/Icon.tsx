/**
 * Jasně Icons — Expo / React Native
 * Generated from Jasně Design System v2
 *
 * Install dependency:
 *   npx expo install react-native-svg
 *
 * Usage:
 *   import { Icon } from './Icons';
 *   <Icon name="camera" size={24} color={colors.blue} />
 *
 * 41 icons — stroke-width 1.6, rounded caps, 24×24 viewBox
 */

import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

// ── Types ──────────────────────────────────────────────────────────────────

export type IconName =
  'search'
  | 'bell'
  | 'bell-dot'
  | 'plus'
  | 'camera'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'check'
  | 'x'
  | 'doc'
  | 'doc-text'
  | 'calendar'
  | 'calendar-plus'
  | 'user'
  | 'mail'
  | 'lock'
  | 'lock-small'
  | 'send'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'pin'
  | 'briefcase'
  | 'alert'
  | 'info'
  | 'clock'
  | 'sparkles'
  | 'star'
  | 'pages'
  | 'sliders'
  | 'shield'
  | 'log-out'
  | 'globe'
  | 'globe-text'
  | 'languages'
  | 'dot'
  | 'eye'
  | 'restore'
  | 'building'
  | 'zap'
  | 'phone-document';

export interface IconProps {
  name: IconName;
  /** Icon size in dp. Default: 24 */
  size?: number;
  /** Stroke color. Default: '#000000' */
  color?: string;
  style?: object;
}

// ── Component ─────────────────────────────────────────────────────────────

export function Icon({ name, size = 24, color = '#000000', style }: IconProps) {
  /** Base Svg props */
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', style } as const;
  /** Shared stroke props for child elements */
  const sp = { stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' } as const;

  switch (name) {
    case 'search': return (
      <Svg {...p}>
        <Circle cx={11} cy={11} r={7} {...sp}/><Path d="m20 20-3.5-3.5" {...sp}/>
      </Svg>
    );
    case 'bell': return (
      <Svg {...p}>
        <Path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" {...sp}/><Path d="M10 19a2 2 0 0 0 4 0" {...sp}/>
      </Svg>
    );
    case 'bell-dot': return (
      <Svg {...p}>
        <Path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" {...sp}/>
        <Path d="M10 19a2 2 0 0 0 4 0" {...sp}/>
        <Circle cx={18} cy={6} r={2.2} fill="#E07F73" stroke="none"/>
      </Svg>
    );
    case 'plus': return (
      <Svg {...p}>
        <Path d="M12 5v14M5 12h14" {...sp}/>
      </Svg>
    );
    case 'camera': return (
      <Svg {...p}>
        <Path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...sp}/><Circle cx={12} cy={13} r={3.5} {...sp}/>
      </Svg>
    );
    case 'chevron-right': return (
      <Svg {...p}>
        <Path d="m9 6 6 6-6 6" {...sp}/>
      </Svg>
    );
    case 'chevron-left': return (
      <Svg {...p}>
        <Path d="m15 6-6 6 6 6" {...sp}/>
      </Svg>
    );
    case 'chevron-down': return (
      <Svg {...p}>
        <Path d="m6 9 6 6 6-6" {...sp}/>
      </Svg>
    );
    case 'check': return (
      <Svg {...p}>
        <Path d="m4.5 12.5 5 5 10-11" {...sp}/>
      </Svg>
    );
    case 'x': return (
      <Svg {...p}>
        <Path d="M6 6l12 12M18 6 6 18" {...sp}/>
      </Svg>
    );
    case 'doc': return (
      <Svg {...p}>
        <Path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" {...sp}/><Path d="M14 3v4h4" {...sp}/>
      </Svg>
    );
    case 'doc-text': return (
      <Svg {...p}>
        <Path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" {...sp}/><Path d="M14 3v4h4" {...sp}/><Path d="M9 13h7M9 17h5" {...sp}/>
      </Svg>
    );
    case 'calendar': return (
      <Svg {...p}>
        <Rect x={3.5} y={5} width={17} height={16} rx={2.5} {...sp}/><Path d="M8 3v4M16 3v4M3.5 10h17" {...sp}/>
      </Svg>
    );
    case 'calendar-plus': return (
      <Svg {...p}>
        <Rect x={3.5} y={5} width={17} height={16} rx={2.5} {...sp}/><Path d="M8 3v4M16 3v4M3.5 10h17M12 14v5M9.5 16.5h5" {...sp}/>
      </Svg>
    );
    case 'user': return (
      <Svg {...p}>
        <Circle cx={12} cy={8} r={4} {...sp}/><Path d="M4 21a8 8 0 0 1 16 0" {...sp}/>
      </Svg>
    );
    case 'mail': return (
      <Svg {...p}>
        <Rect x={3} y={5} width={18} height={14} rx={2} {...sp}/><Path d="m3.5 6.5 8.5 7 8.5-7" {...sp}/>
      </Svg>
    );
    case 'lock': return (
      <Svg {...p}>
        <Rect x={4.5} y={11} width={15} height={10} rx={2.5} {...sp}/><Path d="M8 11V7.5a4 4 0 0 1 8 0V11" {...sp}/>
      </Svg>
    );
    case 'lock-small': return (
      <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <Rect x={3} y={7.5} width={10} height={6.5} rx={1.6} stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/>
        <Path d="M5.2 7.5V5.5a2.8 2.8 0 0 1 5.6 0v2" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/>
      </Svg>
    );
    case 'send': return (
      <Svg {...p}>
        <Path d="m4 12 16-8-5 16-3-7-8-1Z" {...sp}/>
      </Svg>
    );
    case 'arrow-right': return (
      <Svg {...p}>
        <Path d="M5 12h14M14 6l6 6-6 6" {...sp}/>
      </Svg>
    );
    case 'arrow-up-right': return (
      <Svg {...p}>
        <Path d="M7 17 17 7M9 7h8v8" {...sp}/>
      </Svg>
    );
    case 'pin': return (
      <Svg {...p}>
        <Path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12Z" {...sp}/><Circle cx={12} cy={9} r={2.5} {...sp}/>
      </Svg>
    );
    case 'briefcase': return (
      <Svg {...p}>
        <Rect x={3} y={7} width={18} height={13} rx={2} {...sp}/><Path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" {...sp}/>
      </Svg>
    );
    case 'alert': return (
      <Svg {...p}>
        <Path d="M12 4 2.5 20h19L12 4Z" {...sp}/><Path d="M12 10v5M12 17.5v.5" {...sp}/>
      </Svg>
    );
    case 'info': return (
      <Svg {...p}>
        <Circle cx={12} cy={12} r={9} {...sp}/><Path d="M12 8h.01M11 12h1v5h1" {...sp}/>
      </Svg>
    );
    case 'clock': return (
      <Svg {...p}>
        <Circle cx={12} cy={12} r={9} {...sp}/><Path d="M12 7v5l3 2" {...sp}/>
      </Svg>
    );
    case 'sparkles': return (
      <Svg {...p}>
        <Path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.5 2.5M16 16l2.5 2.5M18.5 5.5 16 8M8 16l-2.5 2.5" {...sp}/>
      </Svg>
    );
    case 'star': return (
      <Svg {...p}>
        <Path d="M12 3.5 14.6 9l5.9.9-4.3 4.1 1 5.9L12 17l-5.3 2.9 1-5.9L3.5 9.9 9.4 9 12 3.5Z" {...sp}/>
      </Svg>
    );
    case 'pages': return (
      <Svg {...p}>
        <Rect x={4} y={3} width={13} height={16} rx={2} {...sp}/><Path d="M8 7h5M8 11h5M8 15h3" {...sp}/><Path d="M19 6v14a1 1 0 0 1-1 1H8" {...sp}/>
      </Svg>
    );
    case 'sliders': return (
      <Svg {...p}>
        <Path d="M4 6h12M20 6h0M4 12h6M14 12h6M4 18h10M18 18h2" {...sp}/><Circle cx={18} cy={6} r={1.6} {...sp}/><Circle cx={12} cy={12} r={1.6} {...sp}/><Circle cx={16} cy={18} r={1.6} {...sp}/>
      </Svg>
    );
    case 'shield': return (
      <Svg {...p}>
        <Path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" {...sp}/>
      </Svg>
    );
    case 'log-out': return (
      <Svg {...p}>
        <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H10" {...sp}/>
      </Svg>
    );
    case 'globe': return (
      <Svg {...p}>
        <Circle cx={12} cy={12} r={9} {...sp}/><Path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" {...sp}/>
      </Svg>
    );
    case 'globe-text': return (
      <Svg {...p}>
        <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <Path d="M12 3v18" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/>
        <Path d="M3 12h18" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/>
      </Svg>
    );
    case 'languages': return (
      <Svg {...p}>
        <Path d="M3 5h11M8.5 4v2c0 4-2.5 8-5.5 9M5 11c0 2 2.5 4 6 4M14 21l4-9 4 9M15.5 17.5h5" {...sp}/>
      </Svg>
    );
    case 'dot': return (
      <Svg {...p}>
        <Circle cx={12} cy={12} r={3} fill={color} stroke="none"/>
      </Svg>
    );
    case 'eye': return (
      <Svg {...p}>
        <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" {...sp}/><Circle cx={12} cy={12} r={3} {...sp}/>
      </Svg>
    );
    case 'restore': return (
      <Svg {...p}>
        <Path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" {...sp}/>
      </Svg>
    );
    case 'building': return (
      <Svg {...p}>
        <Rect x={4} y={3} width={16} height={18} rx={1.5} {...sp}/><Path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" {...sp}/>
      </Svg>
    );
    case 'zap': return (
      <Svg {...p}>
        <Path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" {...sp}/>
      </Svg>
    );
    case 'phone-document': return (
      <Svg {...p}>
        <Rect x={6} y={3} width={12} height={18} rx={2} {...sp}/><Path d="M9 7h6M9 11h6M9 15h4" {...sp}/>
      </Svg>
    );
    default: return null;
  }
}
