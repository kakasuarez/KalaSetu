/**
 * Unified Navigation: an auth-gated stack supporting 3 roles.
 *
 * Unauthenticated:
 *   RoleSelect -> (ArtisanLogin, SakhiLogin, AdminLogin)
 *
 * Authenticated:
 *   - 'admin': AdminDashboard
 *   - 'sakhi': SakhiTabs (Profiles, Map, Directory) + SakhiChat
 *   - 'artisan': 4-tab artisan shell (Home, Shop, Inbox, Learn) + wizard screens
 */
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, type NavigatorScreenParams } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import {
  createBottomTabNavigator,
  type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';

import { AdminDashboardScreen } from '../screens/AdminDashboardScreen';
import { AdminLoginScreen } from '../screens/AdminLoginScreen';
import { ArtisanLoginScreen } from '../screens/ArtisanLoginScreen';
import { CaptureScreen } from '../screens/CaptureScreen';
import { CatalogScreen } from '../screens/CatalogScreen';
import { CatalogWizardScreen } from '../screens/CatalogWizardScreen';
import { HealthScreen } from '../screens/HealthScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { LearnScreen } from '../screens/LearnScreen';
import { ListingViewScreen } from '../screens/ListingViewScreen';
import { MockupScreen } from '../screens/MockupScreen';
import { Preview3DScreen } from '../screens/Preview3DScreen';
import { MediaCollectionScreen } from '../screens/MediaCollectionScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ReviewListingScreen } from '../screens/ReviewListingScreen';
import { RoleSelectScreen } from '../screens/RoleSelectScreen';
import { SakhiChatScreen } from '../screens/SakhiChatScreen';
import { SakhiDirectoryScreen } from '../screens/SakhiDirectoryScreen';
import { SakhiLoginScreen } from '../screens/SakhiLoginScreen';
import { SakhiMapScreen } from '../screens/SakhiMapScreen';
import { SakhiProfilesScreen } from '../screens/SakhiProfilesScreen';
import { ThreadDetailScreen } from '../screens/ThreadDetailScreen';
import { VoiceAssistantScreen } from '../screens/VoiceAssistantScreen';
import { useAuth } from '../store/auth';
import { colors, typography } from '../theme';
import { SakhiTabBar } from './SakhiTabBar';
import { TabBar } from './TabBar';

export type AuthStackParamList = {
  RoleSelect: undefined;
  ArtisanLogin: undefined;
  SakhiLogin: undefined;
  AdminLogin: undefined;
};

export type SakhiTabParamList = {
  SakhiProfiles: undefined;
  SakhiMap: undefined;
  SakhiDirectory: undefined;
};

export type TabParamList = {
  Home: undefined;
  Shop: undefined;
  Inbox: undefined;
  Learn: undefined;
};

export type RootStackParamList = {
  // Unauthenticated Auth Routes
  RoleSelect: undefined;
  ArtisanLogin: undefined;
  SakhiLogin: undefined;
  AdminLogin: undefined;

  // Artisan Routes
  Tabs: NavigatorScreenParams<TabParamList>;
  Capture: { additionalForWizard?: boolean } | undefined;
  MediaCollection: {
    source?: 'camera' | 'gallery';
    initialUris?: string[];
    additionalForWizard?: boolean;
    audioUri?: string;
  } | undefined;
  Profile: undefined;
  VoiceAssistant: undefined;
  Thread: { threadId: string };
  ReviewListing: {
    mediaId: string;
    photoUri: string;
    audioMediaId?: string;
    listingId?: string;
  };
  ListingView: {
    listingId: string;
  };
  Preview3D: {
    mediaId: string;
    listingId?: string;
  };
  Mockup: { suggestedTemplate?: string } | undefined;
  CatalogWizard:
    | {
        rawMediaId?: string;
        rawUri?: string;
        additionalMediaId?: string;
        additionalUri?: string;
        additionalMediaIds?: string[];
        additionalUris?: string[];
        extraMediaIds?: string[];
        extraUris?: string[];
        audioMediaId?: string;
      }
    | undefined;
  Health: undefined;

  // Sakhi Routes
  SakhiTabs: NavigatorScreenParams<SakhiTabParamList>;
  SakhiChat: { artisanId: string; artisanName: string };

  // Admin Routes
  AdminDashboard: undefined;
};

export type AppStackParamList = RootStackParamList;

export type AppNav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

export type SakhiNav = CompositeNavigationProp<
  BottomTabNavigationProp<SakhiTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const SakhiTab = createBottomTabNavigator<SakhiTabParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTitleStyle: { ...typography.heading, color: colors.text },
  headerTintColor: colors.primary,
  contentStyle: { backgroundColor: colors.bg },
} as const;

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Shop" component={CatalogScreen} options={{ tabBarLabel: 'Shop' }} />
      <Tab.Screen name="Inbox" component={InboxScreen} options={{ tabBarLabel: 'Inbox' }} />
      <Tab.Screen name="Learn" component={LearnScreen} options={{ tabBarLabel: 'Learn' }} />
    </Tab.Navigator>
  );
}

function SakhiTabs() {
  return (
    <SakhiTab.Navigator
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <SakhiTabBar {...props} />}
    >
      <SakhiTab.Screen
        name="SakhiProfiles"
        component={SakhiProfilesScreen}
        options={{ tabBarLabel: 'Profiles' }}
      />
      <SakhiTab.Screen
        name="SakhiMap"
        component={SakhiMapScreen}
        options={{ tabBarLabel: 'Map' }}
      />
      <SakhiTab.Screen
        name="SakhiDirectory"
        component={SakhiDirectoryScreen}
        options={{ tabBarLabel: 'Directory' }}
      />
    </SakhiTab.Navigator>
  );
}

export function RootNavigator() {
  const { restoring, session } = useAuth();

  if (restoring) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {session ? (
        <Stack.Navigator screenOptions={screenOptions}>
          {session.role === 'admin' ? (
            <Stack.Screen
              name="AdminDashboard"
              component={AdminDashboardScreen}
              options={{ headerShown: false }}
            />
          ) : session.role === 'sakhi' ? (
            <>
              <Stack.Screen
                name="SakhiTabs"
                component={SakhiTabs}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="SakhiChat"
                component={SakhiChatScreen}
                options={{ headerShown: false }}
              />
            </>
          ) : (
            <>
              <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
              <Stack.Screen name="Capture" component={CaptureScreen} options={{ title: '' }} />
              <Stack.Screen
                name="MediaCollection"
                component={MediaCollectionScreen}
                options={{ title: '' }}
              />
              <Stack.Screen
                name="CatalogWizard"
                component={CatalogWizardScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="ReviewListing"
                component={ReviewListingScreen}
                options={{ title: '' }}
              />
              <Stack.Screen
                name="ListingView"
                component={ListingViewScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Mockup"
                component={MockupScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Preview3D"
                component={Preview3DScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Profile"
                component={ProfileScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Thread"
                component={ThreadDetailScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="VoiceAssistant"
                component={VoiceAssistantScreen}
                options={{ headerShown: false, animation: 'fade' }}
              />
              <Stack.Screen name="Health" component={HealthScreen} options={{ title: '' }} />
            </>
          )}
        </Stack.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={screenOptions}>
          <AuthStack.Screen
            name="RoleSelect"
            component={RoleSelectScreen}
            options={{ headerShown: false }}
          />
          <AuthStack.Screen
            name="ArtisanLogin"
            component={ArtisanLoginScreen}
            options={{ title: '' }}
          />
          <AuthStack.Screen
            name="SakhiLogin"
            component={SakhiLoginScreen}
            options={{ title: '' }}
          />
          <AuthStack.Screen
            name="AdminLogin"
            component={AdminLoginScreen}
            options={{ title: '' }}
          />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
