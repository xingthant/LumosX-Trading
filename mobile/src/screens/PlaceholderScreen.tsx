import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../lib/theme';

export default function PlaceholderScreen({ title }: { title: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{title} — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.muted, fontSize: 14 },
});
