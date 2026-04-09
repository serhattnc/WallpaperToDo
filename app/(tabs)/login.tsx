import AppLogo from '@/components/app-logo';
import { supabase } from '@/constants/supabase';
import { AntDesign } from '@expo/vector-icons';
import { Link, Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const performOAuth = async (provider: 'google' | 'apple') => {
    try {
      setLoading(true);
      const redirectUrl = Linking.createURL('/auth/callback'); 
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (error) throw error;

      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (result.type === 'success' && result.url) {
           // Supabase handles the session automatically via deep linking if set up correctly
           // or we can manually parse the session from the URL if needed
           Alert.alert('Success', 'Please check your app for session status');
        }
      }
    } catch (error: any) {
      Alert.alert('OAuth Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      Alert.alert('Login Error', error.message);
    } else {
      // Navigate to main app
      router.replace('/(tabs)/home');
      Alert.alert('Success', 'Logged in successfully!');
    }
    setLoading(false);
  };

  const handleGoogleLogin = () => {
    performOAuth('google');
  };

  const handleAppleLogin = () => {
    performOAuth('apple');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.mainContent}>
            <View style={styles.header}>
              <AppLogo size={86} />
              <Text style={styles.title}>log in</Text>
              <Text style={styles.subtitle}>Enter your email to login</Text>
            </View>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="email@domain.com"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                style={styles.input}
                placeholder="password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              
              <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
                <Text style={styles.primaryButtonText}>{loading ? 'Loading...' : 'Continue'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialButtons}>
              <TouchableOpacity style={styles.socialButton} onPress={handleGoogleLogin}>
                <AntDesign name="google" size={20} color="black" style={styles.socialIcon} />
                <Text style={styles.socialButtonText}>Continue with Google</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.socialButton} onPress={handleAppleLogin}>
                <AntDesign name="apple" size={20} color="black" style={styles.socialIcon} />
                <Text style={styles.socialButtonText}>Continue with Apple</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.footerLink}>
              <Text style={styles.footerText}>You can also </Text>
              <Link href="/register" asChild>
                <TouchableOpacity>
                  <Text style={[styles.footerText, styles.boldText]}>create an account</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>

          <View style={styles.legalContainer}>
            <Text style={styles.legalText}>
              By clicking continue, you agree to our <Text style={styles.boldText}>Terms of Service</Text>
            </Text>
            <Text style={styles.legalText}>
              and <Text style={styles.boldText}>Privacy Policy</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 20,
    justifyContent: 'space-between',
  },
  mainContent: {
    width: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  form: {
    width: '100%',
    marginBottom: 24,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  primaryButton: {
    height: 50,
    backgroundColor: '#000',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#999',
    fontSize: 14,
  },
  socialButtons: {
    marginBottom: 32,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 12,
  },
  socialIcon: {
    marginRight: 12,
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  footerLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
  },
  boldText: {
    fontWeight: 'bold',
    color: '#000',
  },
  legalContainer: {
    alignItems: 'center',
    marginTop: 'auto',
  },
  legalText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
