# iOS Realtime — lifecycle synchronizacji

## Kanał Supabase

`RootineRealtimeClient` otwiera natywny `URLSessionWebSocketTask` pod
`/realtime/v1/websocket?apikey=…&vsn=1.0.0` i dołącza do kanału
`realtime:rootine-sync:<user_id>`. Join deklaruje subskrypcję `INSERT` na
`public.rootine_sync_changes` z filtrem `user_id=eq.<user_id>` oraz broadcast
bez echa. Token sesji jest wysyłany wyłącznie w ramce join i nie jest logowany.

Serwer powinien publikować minimalny sygnał:

```json
{
  "type": "rootine_sync_available",
  "user_id": "…",
  "cursor": 1842,
  "workspace_hint": "tasks"
}
```

Może on być opakowany w wiadomość Supabase `broadcast` albo
`rootine_sync_available`. Sygnał nie zawiera rekordu, treści notatki, danych
zdrowotnych ani finansowych. iOS sprawdza `user_id`, ignoruje cudze sygnały i
uruchamia autorytatywny pull od ostatniego bezpiecznego cursora.

## Odporność i lifecycle

- reconnect: `1s → 2s → 5s → 15s → 30s`, po każdej próbie reconnect wykonywany
  jest pull; opóźnienie jest ograniczone do 5 minut, a wartości zerowe nie
  tworzą aktywnej pętli;
- `phx_error`, `phx_close`, timeout i brak heartbeat ACK aktywują status
  degraded, ale nie usuwają lokalnych danych ani kolejki;
- heartbeat Supabase jest wysyłany co 25 s, z timeoutem ACK 10 s;
- coordinator dopuszcza maksymalnie jeden pull i jeden push, a kolejne sygnały
  scala przez `needsAnotherPull`/`needsAnotherPush`. Żądania przed `start`, po
  `stop` oraz przy niedostępnej sieci są ignorowane;
- polling działa co 30 s w foreground oraz natychmiast po foreground i
  odzyskaniu sieci; w background jest zatrzymywany, gdy nie ma zaległych
  komend, a przy zaległych pushach pozostaje best-effort (wykonuje tylko push).
  Interwał jest ograniczony do 5 minut, a przypadkowe zero/ujemne wartości do
  bezpiecznego minimum;
- `scenePhase` zatrzymuje socket w backgroundzie i wznawia go po powrocie do
  foreground. `NWPathMonitor` zatrzymuje socket i polling offline, a po
  przejściu offline → online uruchamia jeden recovery pull/push w foreground
  albo push-only w background;
- `BGAppRefreshTask` ma krótką, jednorazową próbę i jest planowany ponownie po
  wykonaniu. Expiration anuluje aktywne pull/push, bez usuwania trwałej kolejki;
- `applicationWillTerminate` zamyka socket i koordynator. iOS nie gwarantuje
  dostarczenia tego callbacku, dlatego lokalne mutacje i kolejka muszą być
  trwałe przed wejściem w tę granicę.

Każdy odebrany sygnał musi pochodzić z aktualnie dołączonego topicu i zawierać
identyczny `user_id`; klient dodatkowo deklaruje filtr `user_id=eq.<user_id>` w
join. Nie przyjmuje rekordów innego użytkownika ani ramek z obcego topicu.
Supabase `postgres_changes` (`payload.data.record`) oraz minimalne broadcasty są
normalizowane do tego samego wake-up eventu. Żaden z nich nie zastępuje
autorytatywnego pull/CAS.

## Integracja B05/B06

`RootineSyncOperations` jest adapterem między lifecycle a transportem sync-v3.
Aktualne closure korzystają z `WorkspaceSyncEngine`/legacy reconcile. Po
scaleniu B05/B06 należy podmienić closure na `RootineSyncRemoteClient.pull` i
`push`, zachowując `RootineRealtimeClient` jako wyłącznie wake-up oraz
`WorkspaceFileStore` jako local-first cache. Realtime event nie może być
bezpośrednio mapowany na mutację modelu.
