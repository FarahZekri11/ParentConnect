<?php

namespace App\Console\Commands;

use App\Services\EurekaClientService;
use Illuminate\Console\Command;

class EurekaHeartbeatCommand extends Command
{
    protected $signature = 'eureka:heartbeat {--loop : Exécute le heartbeat en boucle infinie (daemon)}';
    protected $description = 'Envoie le heartbeat de renouvellement de bail à Eureka Server';

    protected bool $running = true;

    public function handle(EurekaClientService $eureka): int
    {
        $loop = (bool) $this->option('loop');
        $interval = (int) config('eureka.heartbeat_interval', 30);

        if (!$loop) {
            $result = $eureka->heartbeat();
            if ($result['success']) {
                $this->info('[OK] ' . $result['message']);
                return Command::SUCCESS;
            }
            $this->error('[ERREUR] ' . $result['message']);
            return Command::FAILURE;
        }

        $this->info(sprintf('Démarrage de la boucle de Heartbeat Eureka (intervalle : %d s)...', $interval));

        // Gestion gracieuse des signaux POSIX (Docker stop / SIGTERM / SIGINT)
        if (function_exists('pcntl_async_signals') && function_exists('pcntl_signal')) {
            pcntl_async_signals(true);
            pcntl_signal(SIGTERM, function () use ($eureka) {
                $this->warn("\nSignal SIGTERM reçu. Déréférencement d'Eureka...");
                $eureka->deregister();
                $this->running = false;
                exit(0);
            });
            pcntl_signal(SIGINT, function () use ($eureka) {
                $this->warn("\nSignal SIGINT reçu. Déréférencement d'Eureka...");
                $eureka->deregister();
                $this->running = false;
                exit(0);
            });
        }

        // Enregistrement initial
        $eureka->register();

        while ($this->running) {
            sleep($interval);
            $result = $eureka->heartbeat();
            $time = now()->format('H:i:s');
            if ($result['success']) {
                $this->line(sprintf('[%s] Heartbeat Eureka OK (Status %d)', $time, $result['status_code']));
            } else {
                $this->warn(sprintf('[%s] Attention Heartbeat : %s', $time, $result['message']));
            }
        }

        return Command::SUCCESS;
    }
}
