import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { getSocket, subscribeToPairs } from '../lib/socket';
import { colors } from '../lib/theme';

interface Balance {
  asset_symbol: string;
  available_balance: string;
  locked_balance: string;
}

interface ResolvedPrice {
  pair: string;
  price: number;
  source: 'override' | 'live';
}

interface Stats {
  pair: string;
  lastPrice: number;
  priceChangePercent: number;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [pairs, setPairs] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, ResolvedPrice>>({});
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [refreshing, setRefreshing] = useState(false);

  function load() {
    api.get<{ balances: Balance[] }>('/api/wallet/balances').then((res) => setBalances(res.balances)).catch(() => {});
    api.get<{ pairs: string[] }>('/api/market/pairs').then((res) => setPairs(res.pairs));
    api
      .get<{ prices: ResolvedPrice[] }>('/api/market/prices')
      .then((res) => {
        const map: Record<string, ResolvedPrice> = {};
        res.prices.forEach((p) => (map[p.pair] = p));
        setPrices(map);
      });
    refreshStats();
  }

  function refreshStats() {
    api
      .get<{ stats: Stats[] }>('/api/market/stats')
      .then((res) => {
        const map: Record<string, Stats> = {};
        res.stats.forEach((s) => (map[s.pair] = s));
        setStats(map);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
    const timer = setInterval(refreshStats, 15000);
    const socket = getSocket();
    const onPrice = (payload: ResolvedPrice) => setPrices((prev) => ({ ...prev, [payload.pair]: payload }));
    socket.on('price', onPrice);
    return () => {
      socket.off('price', onPrice);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (pairs.length) subscribeToPairs(pairs);
  }, [pairs]);

  async function onRefresh() {
    setRefreshing(true);
    load();
    setRefreshing(false);
  }

  const usdtBalance = balances.find((b) => b.asset_symbol === 'USDT');

  const holdings = useMemo(() => {
    return balances
      .map((b) => {
        const total = parseFloat(b.available_balance) + parseFloat(b.locked_balance);
        const price = b.asset_symbol === 'USDT' ? 1 : prices[`${b.asset_symbol}USDT`]?.price;
        return { asset: b.asset_symbol, amount: total, value: price ? total * price : null };
      })
      .filter((h) => h.amount > 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [balances, prices]);

  const portfolioValue = useMemo(() => holdings.reduce((sum, h) => sum + (h.value ?? 0), 0), [holdings]);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <Text style={styles.greeting}>
        {greeting()}, <Text style={styles.greetingName}>{user?.email.split('@')[0]}</Text>
      </Text>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Estimated total balance</Text>
        <Text style={styles.heroValue}>
          {portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} <Text style={styles.heroUnit}>USDT</Text>
        </Text>
        <Text style={styles.heroSub}>
          {parseFloat(usdtBalance?.available_balance || '0').toLocaleString()} USDT available to trade
        </Text>
      </View>

      {holdings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Assets</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {holdings.map((h) => (
              <View key={h.asset} style={styles.assetCard}>
                <View style={styles.assetAvatar}>
                  <Text style={styles.assetAvatarText}>{h.asset.charAt(0)}</Text>
                </View>
                <View>
                  <Text style={styles.assetSymbol}>{h.asset}</Text>
                  <Text style={styles.assetAmount}>
                    {h.amount.toLocaleString(undefined, { maximumFractionDigits: h.amount < 1 ? 6 : 2 })}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <Text style={styles.sectionTitle}>Live Market</Text>
      <View style={styles.marketList}>
        {pairs.map((p) => {
          const price = prices[p]?.price;
          const s = stats[p];
          const up = (s?.priceChangePercent ?? 0) >= 0;
          const base = p.replace(/USDT|USD|BUSD$/, '');
          return (
            <TouchableOpacity key={p} style={styles.marketRow}>
              <View style={styles.marketLeft}>
                <View style={styles.coinAvatar}>
                  <Text style={styles.coinAvatarText}>{base.charAt(0)}</Text>
                </View>
                <View>
                  <Text style={styles.coinSymbol}>{base}</Text>
                  <Text style={styles.coinPair}>{p}</Text>
                </View>
              </View>
              <View style={styles.marketRight}>
                <Text style={styles.coinPrice}>
                  {price ? price.toLocaleString(undefined, { maximumFractionDigits: price < 10 ? 4 : 2 }) : '—'}
                </Text>
                {s && (
                  <Text style={[styles.coinChange, { color: up ? colors.accent : colors.danger }]}>
                    {up ? '+' : ''}
                    {s.priceChangePercent.toFixed(2)}%
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
        {pairs.length === 0 && <Text style={styles.loadingText}>Loading markets…</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  container: { padding: 16, paddingBottom: 32 },
  greeting: { fontSize: 13, color: colors.muted, marginBottom: 8 },
  greetingName: { color: colors.white },
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: 20,
    marginBottom: 16,
  },
  heroLabel: { fontSize: 12, color: colors.muted },
  heroValue: { fontSize: 30, fontWeight: '700', color: colors.white, marginTop: 4 },
  heroUnit: { fontSize: 16, fontWeight: '500', color: colors.muted },
  heroSub: { fontSize: 11, color: colors.muted, marginTop: 4 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 8 },
  assetCard: {
    minWidth: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
  },
  assetAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.panel2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetAvatarText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  assetSymbol: { fontSize: 12, fontWeight: '600', color: colors.white },
  assetAmount: { fontSize: 11, color: colors.muted },
  marketList: { gap: 6 },
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  marketLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coinAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.panel2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinAvatarText: { color: colors.white, fontWeight: '700' },
  coinSymbol: { fontSize: 14, fontWeight: '600', color: colors.white },
  coinPair: { fontSize: 11, color: colors.muted },
  marketRight: { alignItems: 'flex-end' },
  coinPrice: { fontSize: 14, fontWeight: '500', color: colors.white },
  coinChange: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  loadingText: { textAlign: 'center', color: colors.muted, paddingVertical: 24 },
});
