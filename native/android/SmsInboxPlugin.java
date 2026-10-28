package com.rupivo.app;

import android.Manifest;
import android.database.Cursor;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import java.util.regex.Pattern;

/**
 * Capacitor plugin "SmsInbox" — the bridge sms.js expects (window.Capacitor.Plugins.SmsInbox).
 * Returns ONLY messages whose sender looks like a bank/DLT sender id; personal numbers never leave this class.
 * Nothing is stored or sent anywhere here: messages go straight to the web layer on the same device.
 */
@CapacitorPlugin(name = "SmsInbox", permissions = {
    @Permission(strings = { Manifest.permission.READ_SMS }, alias = "sms")
})
public class SmsInboxPlugin extends Plugin {

    // e.g. VM-HDFCBK-S, AD-KOTAKB, SBIUPI  (letters/digits, not a phone number)
    private static final Pattern DLT = Pattern.compile("^[A-Za-z]{2}-[A-Za-z0-9]{3,9}(-[A-Za-z])?$");
    private static final Pattern SHORT = Pattern.compile("^[A-Za-z][A-Za-z0-9]{4,10}$");

    private static boolean isBankSender(String a) {
        if (a == null) return false;
        a = a.trim();
        return DLT.matcher(a).matches() || SHORT.matcher(a).matches();
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            checkPermission(call);
        } else {
            requestPermissionForAlias("sms", call, "permCallback");
        }
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        checkPermission(call);
    }

    @PluginMethod
    public void readBankMessages(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permission not granted");
            return;
        }
        long since = call.getLong("since", 0L);
        int limit = call.getInt("limit", 500);
        JSArray out = new JSArray();
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                Uri.parse("content://sms/inbox"),
                new String[] { "_id", "address", "body", "date" },
                "date > ?", new String[] { String.valueOf(since) },
                "date DESC");
            while (c != null && c.moveToNext() && out.length() < limit) {
                String addr = c.getString(1);
                if (!isBankSender(addr)) continue; // personal / unknown senders are skipped here
                JSObject m = new JSObject();
                m.put("id", c.getLong(0));
                m.put("address", addr);
                m.put("body", c.getString(2));
                m.put("date", c.getLong(3));
                out.put(m);
            }
        } catch (Exception e) {
            call.reject("Could not read messages: " + e.getMessage());
            return;
        } finally {
            if (c != null) c.close();
        }
        JSObject r = new JSObject();
        r.put("messages", out);
        call.resolve(r);
    }
}
