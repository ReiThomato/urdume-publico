package app.urdume.publico;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin próprio, escrito neste projeto: isenção de bateria.
        // Sem registrar aqui ele não existe para o JavaScript.
        registerPlugin(BateriaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
