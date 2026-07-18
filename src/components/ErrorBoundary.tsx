import { Component, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Sentry from "@sentry/react-native";

import { fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Root JS error boundary. Without it, any unhandled render error unmounts the
 * whole tree and leaves the user staring at a blank screen. Here we report the
 * crash to Sentry and show a themed fallback with a one-tap recovery action.
 *
 * Must be a class component — componentDidCatch / getDerivedStateFromError have
 * no hook equivalent. The fallback itself is a function component so it can use
 * the theme via useColors().
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack ?? undefined },
    });
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorFallback onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ onReset }: { onReset: () => void }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Text style={styles.iconText}>!</Text>
      </View>
      <Text style={styles.title}>{t("errorBoundary.title")}</Text>
      <Text style={styles.body}>{t("errorBoundary.body")}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("errorBoundary.retry")}
        onPress={onReset}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>{t("errorBoundary.retry")}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 14,
      backgroundColor: colors.bg,
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface2,
      marginBottom: 4,
    },
    iconText: {
      color: colors.danger,
      fontFamily: fonts.display,
      fontSize: 34,
      lineHeight: 38,
      fontWeight: "800",
    },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      ...typeStyles.title3,
      textAlign: "center",
    },
    body: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowSecondary,
      textAlign: "center",
    },
    button: {
      minHeight: 50,
      borderRadius: 16,
      paddingHorizontal: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brandBlue,
      marginTop: 8,
    },
    buttonPressed: { opacity: 0.8 },
    buttonText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.button,
    },
  });
}
