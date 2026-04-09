import AppLogo from '@/components/app-logo';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.content}>
        <AppLogo size={86} />
        <Text style={styles.title}>Emailinizi kabul edin</Text>
        <Text style={styles.subtitle}>
          Hesabinizi aktif etmek icin gelen kutunuzu kontrol edin ve dogrulama linkine basin.
        </Text>
        {email ? <Text style={styles.email}>{email}</Text> : null}

        <Link href="/login" asChild>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>Giris sayfasina don</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    marginTop: 24,
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    color: '#555',
    lineHeight: 24,
    textAlign: 'center',
  },
  email: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  button: {
    marginTop: 28,
    backgroundColor: '#000',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
