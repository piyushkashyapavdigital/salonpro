/**
 * The service menu: what the salon sells, what it costs, and how it performs.
 *
 * Prices are entered in rupees and sent to the server in paise — the conversion
 * happens in exactly one place (here) so a ₹499 service can never be charged as
 * ₹4.99.
 */
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../shared/auth';
import { admin } from '../../shared/endpoints';
import { errorMessage, useAsync } from '../../shared/hooks';
import { Badge, Banner, Button, Card, Chip, Empty, Field, Loading, SectionTitle } from '../../shared/components';
import { colors, font, radius, shadow, space } from '../../shared/theme';
import { formatMoney, rupeesToPaise } from '../../core';

const EMOJI_CHOICES = ['✂️', '💇', '💅', '🧖', '🪒', '🎨', '💆', '🧴', '👰', '🍃'];

export function ServicesScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const services = useAsync(() => admin.services(), []);

  // Stylists and reception can read the menu; only a manager or owner edits it.
  const canManage = user?.permissions.includes('salon.service.manage') ?? false;

  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; category: string; price: string; durationMinutes: string; imageEmoji: string; description: string }>(
    { name: '', category: '', price: '', durationMinutes: '30', imageEmoji: '✂️', description: '' },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = services.data?.services ?? [];
  const categories = Array.from(new Set(rows.map((service) => service.category))).sort();

  const resetForm = () =>
    setForm({ name: '', category: '', price: '', durationMinutes: '30', imageEmoji: '✂️', description: '' });

  const create = async () => {
    const rupees = Number(form.price.replace(/[^\d.]/g, ''));
    const duration = Number(form.durationMinutes.replace(/\D/g, ''));
    if (form.name.trim().length < 2) return setError('Give the service a name.');
    if (form.category.trim().length < 2) return setError('Give it a category, for example Hair or Spa.');
    if (!Number.isFinite(rupees) || rupees <= 0) return setError('Enter the price in rupees, for example 499.');
    if (!Number.isFinite(duration) || duration < 5) return setError('Duration must be at least 5 minutes.');
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await admin.createService({
        name: form.name.trim(),
        category: form.category.trim(),
        description: form.description.trim(),
        price: rupeesToPaise(rupees),
        durationMinutes: duration,
        imageEmoji: form.imageEmoji,
        active: true,
      });
      setMessage(`${form.name.trim()} added to the menu.`);
      setCreating(false);
      resetForm();
      await services.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, note: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await admin.updateService(id, body);
      setMessage(note);
      await services.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveRow = async (id: string) => {
    const rupees = Number(form.price.replace(/[^\d.]/g, ''));
    const duration = Number(form.durationMinutes.replace(/\D/g, ''));
    if (!Number.isFinite(rupees) || rupees < 0) return setError('Enter a valid price in rupees.');
    if (!Number.isFinite(duration) || duration < 5) return setError('Duration must be at least 5 minutes.');
    await patch(
      id,
      {
        name: form.name.trim(),
        category: form.category.trim(),
        description: form.description.trim(),
        price: rupeesToPaise(rupees),
        durationMinutes: duration,
        imageEmoji: form.imageEmoji,
      },
      'Saved.',
    );
    setOpenId(null);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <MaterialIcons name="arrow-back" size={22} color={colors.ink800} onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Services</Text>
          <Text style={styles.sub}>{rows.length} on the menu</Text>
        </View>
        {canManage ? (
          <Button label={creating ? 'Close' : 'New'} size="sm" onPress={() => setCreating((value) => !value)} />
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={services.refreshing} onRefresh={services.refresh} tintColor={colors.brand500} />}
      >
        {error ? <Banner tone="error" title="Not saved" message={error} /> : null}
        {message ? <Banner tone="success" message={message} /> : null}
        {services.error ? <Banner tone="error" message={services.error} action="Try again" onAction={services.reload} /> : null}

        {creating && canManage ? (
          <Card>
            <SectionTitle title="New service" />
            <Field label="Name" value={form.name} onChangeText={(name) => setForm((current) => ({ ...current, name }))} placeholder="Balayage" />
            <Field
              label="Category"
              value={form.category}
              onChangeText={(category) => setForm((current) => ({ ...current, category }))}
              placeholder="Hair"
              hint={categories.length ? `Existing: ${categories.slice(0, 4).join(', ')}` : undefined}
            />
            <View style={styles.twoUp}>
              <Field
                label="Price (₹)"
                value={form.price}
                onChangeText={(price) => setForm((current) => ({ ...current, price }))}
                placeholder="1499"
                keyboardType="decimal-pad"
                style={{ flex: 1 }}
              />
              <Field
                label="Minutes"
                value={form.durationMinutes}
                onChangeText={(durationMinutes) => setForm((current) => ({ ...current, durationMinutes }))}
                keyboardType="number-pad"
                style={{ flex: 1 }}
              />
            </View>
            <Text style={styles.label}>Icon</Text>
            <View style={styles.chips}>
              {EMOJI_CHOICES.map((emoji) => (
                <Chip key={emoji} label={emoji} active={form.imageEmoji === emoji} onPress={() => setForm((current) => ({ ...current, imageEmoji: emoji }))} />
              ))}
            </View>
            <Field
              label="Description"
              value={form.description}
              onChangeText={(description) => setForm((current) => ({ ...current, description }))}
              placeholder="What the customer gets"
              multiline
              numberOfLines={2}
            />
            <Button label={busy ? 'Saving…' : 'Add to the menu'} loading={busy} onPress={() => void create()} style={{ marginTop: space(3) }} />
          </Card>
        ) : null}

        {services.loading && !services.data ? (
          <Loading label="Loading the menu…" />
        ) : rows.length === 0 ? (
          <Card>
            <Empty icon="✂️" title="No services yet" message="Add the first service and bookings can start." />
          </Card>
        ) : (
          rows.map((service) => {
            const open = openId === service.id;
            return (
              <Card key={service.id}>
                <Pressable
                  disabled={!canManage}
                  onPress={() => {
                    if (!canManage) return;
                    if (open) {
                      setOpenId(null);
                      return;
                    }
                    setOpenId(service.id);
                    setForm({
                      name: service.name,
                      category: service.category,
                      price: String(service.price / 100),
                      durationMinutes: String(service.durationMinutes),
                      imageEmoji: service.imageEmoji || '✂️',
                      description: service.description ?? '',
                    });
                  }}
                  style={styles.serviceRow}
                >
                  <Text style={styles.emoji}>{service.imageEmoji || '✂️'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <Text style={styles.meta}>
                      {service.category} · {formatMoney(service.price)} · {service.durationMinutes} min
                      {'completions' in service && service.completions ? ` · ${service.completions} bookings` : ''}
                      {'revenue' in service && service.revenue ? ` · ${formatMoney(Number(service.revenue))}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: space(1) }}>
                    <Badge
                      label={service.active === false ? 'hidden' : 'live'}
                      bg={service.active === false ? colors.ink100 : colors.mintSoft}
                      fg={service.active === false ? colors.ink600 : colors.mint}
                    />
                    {canManage ? <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color={colors.ink300} /> : null}
                  </View>
                </Pressable>

                {open && canManage ? (
                  <View style={styles.editBlock}>
                    <Field label="Name" value={form.name} onChangeText={(name) => setForm((current) => ({ ...current, name }))} />
                    <View style={styles.twoUp}>
                      <Field
                        label="Price (₹)"
                        value={form.price}
                        onChangeText={(price) => setForm((current) => ({ ...current, price }))}
                        keyboardType="decimal-pad"
                        style={{ flex: 1 }}
                      />
                      <Field
                        label="Minutes"
                        value={form.durationMinutes}
                        onChangeText={(durationMinutes) => setForm((current) => ({ ...current, durationMinutes }))}
                        keyboardType="number-pad"
                        style={{ flex: 1 }}
                      />
                    </View>
                    <Field
                      label="Description"
                      value={form.description}
                      onChangeText={(description) => setForm((current) => ({ ...current, description }))}
                      multiline
                      numberOfLines={2}
                    />
                    <View style={styles.chips}>
                      {EMOJI_CHOICES.map((emoji) => (
                        <Chip key={emoji} label={emoji} active={form.imageEmoji === emoji} onPress={() => setForm((current) => ({ ...current, imageEmoji: emoji }))} />
                      ))}
                    </View>
                    <Button label={busy ? 'Saving…' : 'Save changes'} loading={busy} onPress={() => void saveRow(service.id)} style={{ marginTop: space(3) }} />
                    <Button
                      label={service.active === false ? 'Show on the app again' : 'Hide from the app'}
                      variant="secondary"
                      style={{ marginTop: space(2) }}
                      onPress={() =>
                        void patch(service.id, { active: service.active === false }, service.active === false ? 'Back on the menu.' : 'Hidden from customers.')
                      }
                    />
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink900 },
  sub: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  emoji: { fontSize: 24 },
  serviceName: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink900 },
  meta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  editBlock: { marginTop: space(3), paddingTop: space(3), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100, gap: space(2) },
  twoUp: { flexDirection: 'row', gap: space(2) },
  label: { fontSize: font.size.xs, color: colors.ink500, marginTop: space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
});
