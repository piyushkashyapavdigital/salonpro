import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, motion, radius, shadow, space } from '../shared/theme';

export type GlobalTabItem = {
  name: string;
  label: string;
  icon: string;
};

/**
 * The active tab inside the nested tab navigator.
 *
 * The stack cannot see a child's tab state reliably, so the tab navigator
 * reports itself here and the bar renders that value.
 */
type WorkspaceTabValue = {
  active: string;
  setActive: (name: string) => void;
};

const WorkspaceTabContext = createContext<WorkspaceTabValue>({
  active: '',
  setActive: () => {},
});

export function useWorkspaceTab(): WorkspaceTabValue {
  return useContext(WorkspaceTabContext);
}

function TabButton({
  item,
  active,
  onPress,
}: {
  item: GlobalTabItem;
  active: boolean;
  onPress: () => void;
}) {
  const lift = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(lift, {
      toValue: active ? 1 : 0,
      useNativeDriver: true,
      ...motion.spring,
    }).start();
  }, [active, lift]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(press, { toValue: 0.94, useNativeDriver: true, ...motion.spring }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, ...motion.spring }).start()}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      style={styles.item}
    >
      <Animated.View
        style={[
          styles.iconWrap,
          active && styles.iconWrapActive,
          {
            transform: [
              { scale: press },
              { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) },
            ],
          },
        ]}
      >
        <MaterialIcons
          name={item.icon}
          size={18}
          color={active ? colors.paper : 'rgba(251,248,242,0.46)'}
        />
      </Animated.View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );
}

/**
 * The one bottom bar for every workspace screen: a floating ink capsule with a
 * vermilion seat for the current room. It lives in the stack's `layout` rather
 * than inside a tab navigator, so it survives pushed detail screens.
 */
export function GlobalTabBar({
  items,
  active,
  onSelect,
}: {
  items: readonly GlobalTabItem[];
  active: string;
  onSelect: (name: string) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space(2.5)) }]}>
      <View style={styles.capsule}>
        {items.map((item) => (
          <TabButton
            key={item.name}
            item={item}
            active={item.name === active}
            onPress={() => onSelect(item.name)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Wraps a native stack with the persistent tab bar. The navigator passes its
 * own state and navigation helpers, so the bar can identify the current screen
 * and switch tabs without a second navigation container.
 */
export function WorkspaceShell({
  children,
  state,
  navigation,
  items,
  detailTabs,
  initialTab,
}: {
  children: React.ReactNode;
  state: any;
  navigation: any;
  items: readonly GlobalTabItem[];
  detailTabs: Record<string, string>;
  initialTab: string;
}) {
  const [tabActive, setTabActive] = useState(initialTab);

  /* The nested tab navigator reports the tab it is on; a pushed detail screen
   * keeps the tab it belongs to highlighted. */
  const route = state.routes[state.index ?? 0];
  const active = route?.name === 'Main' ? tabActive : detailTabs[route?.name] ?? tabActive;
  const resolved = items.some((item) => item.name === active) ? active : items[0]?.name ?? '';

  return (
    <WorkspaceTabContext.Provider value={{ active: tabActive, setActive: setTabActive }}>
      <View style={styles.shell}>
        <View style={styles.content}>{children}</View>
        <GlobalTabBar
          items={items}
          active={resolved}
          onSelect={(name) => {
            setTabActive(name);
            navigation.navigate('Main', { screen: name });
          }}
        />
      </View>
    </WorkspaceTabContext.Provider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.canvas },
  content: { flex: 1 },
  bar: {
    backgroundColor: colors.canvas,
    paddingTop: space(1.5),
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginHorizontal: space(3.5),
    paddingHorizontal: space(1.5),
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.ink900,
    ...shadow.raised,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 2,
  },
  iconWrap: {
    width: 34,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: colors.clay },
  label: {
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: font.weight.bold,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: 'rgba(251,248,242,0.48)',
  },
  labelActive: { color: colors.paper },
});
