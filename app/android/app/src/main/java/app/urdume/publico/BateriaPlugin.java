package app.urdume.publico;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Isenção de otimização de bateria.
 *
 * Por que isto existe: medido no Redmi 12 (MIUI, Android 15), o app fica no
 * bucket de standby `RARE`. Nesse bucket, um alarme INEXATO foi reagendado pelo
 * sistema para +2d23h — ou seja, o aviso nunca chegava. O alarme EXATO chegou
 * no minuto marcado. As duas correções andam juntas:
 *
 *   1. `USE_EXACT_ALARM` no manifesto (concedida na instalação), para o
 *      agendamento ser exato;
 *   2. esta isenção, para o app sair do `RARE` e o trabalho periódico do runner
 *      rodar de fato.
 *
 * A tela que o sistema abre é a oficial ("Permitir que o app funcione em
 * segundo plano"). O usuário pode recusar: nada quebra, e o app mostra o
 * estado real em vez de prometer.
 */
@CapacitorPlugin(name = "Bateria")
public class BateriaPlugin extends Plugin {

    /** O Android já não aplica Doze a este app? */
    @PluginMethod
    public void estado(PluginCall call) {
        Context contexto = getContext();
        PowerManager gerenciador = (PowerManager) contexto.getSystemService(Context.POWER_SERVICE);

        JSObject resultado = new JSObject();
        resultado.put("isento", gerenciador != null && gerenciador.isIgnoringBatteryOptimizations(contexto.getPackageName()));
        resultado.put("versao", Build.VERSION.SDK_INT);
        call.resolve(resultado);
    }

    /**
     * Versão instalada, lida do sistema.
     *
     * O rodapé do app mostrava um número vindo do `package.json`, que não muda
     * entre entregas. Depois de instalar, a pergunta é sempre a mesma: "esta é
     * a versão nova?". Só o PackageManager responde isso com verdade.
     */
    @PluginMethod
    public void versao(PluginCall call) {
        try {
            Context contexto = getContext();
            android.content.pm.PackageInfo info =
                    contexto.getPackageManager().getPackageInfo(contexto.getPackageName(), 0);

            JSObject resultado = new JSObject();
            resultado.put("versionName", info.versionName);
            resultado.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? info.getLongVersionCode()
                    : info.versionCode);
            call.resolve(resultado);
        } catch (Exception erro) {
            call.reject("Não foi possível ler a versão instalada.", erro);
        }
    }

    /**
     * Abre a tela do sistema pedindo a isenção.
     *
     * **Medido no Redmi 12 (MIUI, Android 15):** a intent genérica
     * `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` NÃO abre a caixa "Permitir
     * que o app funcione em segundo plano". O MIUI desvia para "Detalhes do uso
     * da bateria", onde aparece — e isto é a causa do silêncio — a opção
     * **"Fechar apps após 10 minutos de atividade em segundo plano"** já
     * marcada. Nesse estado o app é morto e nenhum alarme sobrevive.
     *
     * A primeira tentativa na tela real foi esta: a caixa de isenção nunca
     * apareceu. Por isso o caminho é a tela de detalhes do app no MIUI, que é
     * onde o interruptor de verdade mora, com a genérica como reserva para os
     * aparelhos que não têm a tela da Xiaomi.
     */
    @PluginMethod
    public void pedir(PluginCall call) {
        Context contexto = getContext();
        String pacote = contexto.getPackageName();

        // 1. Tela de bateria DESTE app no MIUI: é onde fica "sem restrições"
        //    e onde está o "fechar após 10 minutos" que mata o app.
        if (abrirIntent(contexto, new Intent("miui.intent.action.APP_BATTERY_DETAIL")
                .setClassName("com.miui.powerkeeper", "com.miui.powerkeeper.ui.PowerBatteryActivity")
                .putExtra("IntentExtra.PACKAGE_NAME", pacote))) {
            call.resolve(estadoAtual());
            return;
        }

        // 2. Tela de bateria do app, no padrão do Android 11+.
        //    String literal: a constante não existe em todas as versões do SDK.
        if (abrirIntent(contexto, new Intent("android.settings.APP_BATTERY_SETTINGS")
                .setData(Uri.parse("package:" + pacote)))) {
            call.resolve(estadoAtual());
            return;
        }

        // 3. Caixa de isenção direta (Android puro).
        try {
            Intent direto = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            direto.setData(Uri.parse("package:" + pacote));
            direto.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            contexto.startActivity(direto);
            call.resolve(estadoAtual());
            return;
        } catch (Exception primeira) {
            // Fabricante sem a tela direta: tenta a lista geral.
        }

        // 4. Lista geral de otimização de bateria.
        try {
            Intent lista = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            lista.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            contexto.startActivity(lista);
            call.resolve(estadoAtual());
        } catch (Exception segunda) {
            call.reject("Este aparelho não abre a tela de bateria.", segunda);
        }
    }

    /** Tenta abrir; devolve falso se o aparelho não tiver essa tela. */
    private boolean abrirIntent(Context contexto, Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (intent.resolveActivity(contexto.getPackageManager()) == null) return false;
            contexto.startActivity(intent);
            return true;
        } catch (Exception erro) {
            return false;
        }
    }

    private JSObject estadoAtual() {
        Context contexto = getContext();
        PowerManager gerenciador = (PowerManager) contexto.getSystemService(Context.POWER_SERVICE);
        JSObject resultado = new JSObject();
        resultado.put("isento", gerenciador != null && gerenciador.isIgnoringBatteryOptimizations(contexto.getPackageName()));
        return resultado;
    }
}
