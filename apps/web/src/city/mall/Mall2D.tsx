/**
 * The mall in Lite (no WebGL), drawn in SVG: the concourse on two levels
 * (shopfronts with their signs, the escalator, a skylight), shoppers with
 * bags and you; inside a shop, its room with what it sells and you in it,
 * large, wearing what you're trying on. The bigger mall's shops are
 * upstairs and drawn as shelves of their goods; a friend shopping with you
 * stands at your side.
 */
import type { MallShopId } from '@runway/engine';
import { AvatarFigure, type AvatarLook } from '../art';
import { tx } from '../../i18n';
import { SHOP_COLOUR, SHOP_ICON, SHOP_ORDER } from './shops';

const TOPS = ['#db2777', '#2563eb', '#f59e0b', '#16a34a', '#111827', '#7c3aed'];

function Front({
  x,
  y,
  w,
  name,
  colour,
}: {
  x: number;
  y: number;
  w: number;
  name: string;
  colour: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={70} fill="#f8fafc" stroke="#cbd5e1" />
      <rect x={x} y={y} width={w} height={14} fill={colour} />
      <text
        x={x + w / 2}
        y={y + 10.5}
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="#fff"
      >
        {name.length > 18 ? `${name.slice(0, 17)}…` : name}
      </text>
      <rect x={x + 4} y={y + 18} width={w - 8} height={52} fill="#bae6fd" opacity="0.55" />
      <rect x={x + w / 2 - 7} y={y + 34} width={14} height={36} fill="#e0f2fe" opacity="0.8" />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={x + 8 + i * ((w - 22) / 3)}
          y={y + 40}
          width={8}
          height={22}
          fill={TOPS[(i + name.length) % TOPS.length]}
        />
      ))}
    </g>
  );
}

function ShopRoom({ shop, colour }: { shop: MallShopId; colour: string }) {
  switch (shop) {
    case 'fashion':
      return (
        <g>
          {[40, 140, 240].map((x) => (
            <g key={x}>
              <line x1={x} y1={110} x2={x + 80} y2={110} stroke="#9ca3af" strokeWidth="3" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <rect
                  key={i}
                  x={x + 4 + i * 13}
                  y={112}
                  width={11}
                  height={40}
                  rx={3}
                  fill={TOPS[(i + x) % TOPS.length]}
                />
              ))}
            </g>
          ))}
          <rect x={300} y={60} width={40} height={110} fill="#e2e8f0" stroke="#94a3b8" />
        </g>
      );
    case 'phones':
      return (
        <g>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect
              key={i}
              x={30 + (i % 3) * 105}
              y={50 + Math.floor(i / 3) * 55}
              width={90}
              height={45}
              fill="#0f172a"
              stroke="#334155"
            />
          ))}
          <rect x={40} y={190} width={280} height={30} fill="#f8fafc" stroke="#cbd5e1" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={60 + i * 42} y={184} width={16} height={8} fill="#38bdf8" />
          ))}
        </g>
      );
    case 'home':
      return (
        <g>
          <rect x={30} y={150} width={140} height={45} rx={10} fill="#64748b" />
          <rect x={30} y={125} width={140} height={30} rx={8} fill="#748298" />
          <rect x={200} y={140} width={130} height={55} rx={6} fill="#f8fafc" stroke="#cbd5e1" />
          <rect x={200} y={115} width={130} height={30} fill="#78350f" />
          <ellipse cx={100} cy={215} rx={110} ry={14} fill="#b45309" opacity="0.7" />
        </g>
      );
    case 'supermarket':
      return (
        <g>
          {[0, 1, 2].map((r) => (
            <g key={r}>
              <rect x={20 + r * 110} y={60} width={100} height={150} fill="#e5e7eb" />
              {[0, 1, 2, 3].map((row) =>
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <rect
                    key={`${row}:${i}`}
                    x={24 + r * 110 + i * 16}
                    y={70 + row * 35}
                    width={13}
                    height={25}
                    fill={TOPS[(i + row + r) % TOPS.length]}
                  />
                )),
              )}
            </g>
          ))}
        </g>
      );
    case 'foodcourt':
      return (
        <g>
          {['#ea580c', '#dc2626', '#f59e0b', '#16a34a'].map((c, i) => (
            <rect key={c} x={10 + i * 87} y={40} width={80} height={60} fill={c} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <ellipse cx={50 + i * 85} cy={180} rx={28} ry={8} fill="#f8fafc" stroke="#cbd5e1" />
              <rect x={48 + i * 85} y={180} width={4} height={30} fill="#64748b" />
            </g>
          ))}
        </g>
      );
    case 'cinema':
      return (
        <g>
          <rect x={0} y={0} width={360} height={260} fill="#1e1b4b" />
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              x={30 + i * 110}
              y={40}
              width={80}
              height={110}
              fill={['#f97316', '#2563eb', '#db2777'][i]}
              stroke="#fde68a"
              strokeWidth="3"
            />
          ))}
          <rect x={80} y={180} width={200} height={40} fill={colour} />
        </g>
      );
    default:
      // The bigger mall's shops: shelves of their goods, a counter, the shop's icon.
      return (
        <g>
          {shop === 'arcade' && <rect x={0} y={22} width={360} height={203} fill="#1e1b4b" />}
          {[0, 1, 2].map((r) => (
            <g key={r}>
              <rect x={20} y={62 + r * 46} width={320} height={5} fill="#cbd5e1" />
              {Array.from({ length: 12 }, (_, i) => (
                <rect
                  key={i}
                  x={26 + i * 26}
                  y={40 + r * 46}
                  width={shop === 'books' ? 9 : 16}
                  height={22}
                  rx={shop === 'beauty' || shop === 'pharmacy' ? 5 : 2}
                  fill={TOPS[(i + r * 2 + shop.length) % TOPS.length]}
                />
              ))}
            </g>
          ))}
          <rect x={110} y={185} width={140} height={40} rx={6} fill={colour} />
          <text x={180} y={212} textAnchor="middle" fontSize="20">
            {SHOP_ICON[shop]}
          </text>
        </g>
      );
  }
}

export function Mall2D({
  me,
  friend = null,
  shoppers,
  focus,
  shops = SHOP_ORDER.slice(0, 6),
  names,
  mallName,
}: {
  me: AvatarLook;
  /** The friend shopping with you (at your side). */
  friend?: AvatarLook | null;
  shoppers: AvatarLook[];
  focus: MallShopId | null;
  /** The shops open here. */
  shops?: readonly MallShopId[];
  names: Record<MallShopId, string>;
  mallName: string;
}) {
  const upstairs = shops.filter((s) => !SHOP_ORDER.slice(0, 6).includes(s)).slice(0, 4);
  if (focus)
    return (
      <svg
        className="mall-2d"
        viewBox="0 0 360 260"
        preserveAspectRatio="xMidYMid slice"
        data-mall-2d={focus}
      >
        <rect x={0} y={0} width={360} height={260} fill="#faf7f2" />
        <rect x={0} y={225} width={360} height={35} fill="#e7e2d8" />
        <rect x={0} y={0} width={360} height={22} fill={SHOP_COLOUR[focus]} />
        <text x={180} y={15} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
          {tx(names[focus])}
        </text>
        <ShopRoom shop={focus} colour={SHOP_COLOUR[focus]} />
        {friend && (
          <g transform="translate(270 252) scale(3.1)" data-mall-friend="">
            <AvatarFigure look={friend} />
          </g>
        )}
        <g transform={`translate(${friend ? 150 : 180} 252) scale(3.4)`} data-mall-me="">
          <AvatarFigure look={me} />
        </g>
      </svg>
    );
  return (
    <svg
      className="mall-2d"
      viewBox="0 0 360 260"
      preserveAspectRatio="xMidYMid slice"
      data-mall-2d="concourse"
    >
      <defs>
        <linearGradient id="mall-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#f8f6f2" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={360} height={260} fill="url(#mall-sky)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={20 + i * 66} y={4} width={56} height={8} fill="#fff" opacity="0.9" />
      ))}
      <text x={180} y={24} textAnchor="middle" fontSize="10" fontWeight="800" fill="#0f172a">
        {mallName}
      </text>
      {/* Upstairs. */}
      {upstairs.length
        ? upstairs.map((s, i) => (
            <Front
              key={s}
              x={8 + i * 87}
              y={30}
              w={80}
              name={tx(names[s])}
              colour={SHOP_COLOUR[s]}
            />
          ))
        : ['Sports', 'Books', 'Beauty', 'Kids'].map((n, i) => (
            <Front
              key={n}
              x={8 + i * 87}
              y={30}
              w={80}
              name={n}
              colour={['#0ea5e9', '#a16207', '#ec4899', '#f59e0b'][i]!}
            />
          ))}
      <rect x={0} y={100} width={360} height={8} fill="#e7e2d8" />
      <rect x={0} y={92} width={360} height={8} fill="#bfe3f2" opacity="0.6" />
      {/* Downstairs. */}
      {SHOP_ORDER.slice(0, 4).map((s, i) => (
        <Front key={s} x={8 + i * 87} y={112} w={80} name={tx(names[s])} colour={SHOP_COLOUR[s]} />
      ))}
      {/* The escalator. */}
      <polygon points="150,182 210,104 226,104 166,182" fill="#64748b" />
      <polygon points="150,182 210,104 214,104 154,182" fill="#94a3b8" />
      <rect x={0} y={182} width={360} height={78} fill="#ece7df" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={i} x1={i * 72} y1={182} x2={i * 72 - 40} y2={260} stroke="#ddd6c8" />
      ))}
      {shoppers.slice(0, 7).map((look, i) => (
        <g
          key={i}
          transform={`translate(${30 + i * 48} ${215 + (i % 3) * 12}) scale(1.25)`}
          className="mall-walker"
        >
          <AvatarFigure look={look} />
          <rect x={6} y={-16} width={6} height={7} fill={TOPS[i % TOPS.length]} />
        </g>
      ))}
      {friend && (
        <g transform="translate(212 250) scale(1.55)" data-mall-friend="">
          <AvatarFigure look={friend} />
        </g>
      )}
      <g transform="translate(184 250) scale(1.6)" data-mall-me="">
        <AvatarFigure look={me} />
      </g>
    </svg>
  );
}
