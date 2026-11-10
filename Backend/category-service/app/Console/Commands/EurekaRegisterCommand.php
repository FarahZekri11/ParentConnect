<?php

namespace App\Console\Commands;

use App\Services\EurekaClientService;
use Illuminate\Console\Command;

class EurekaRegisterCommand extends Command
{
    protected $signature = 'eureka:register';
    protected $description = 'Enregistre le microservice Laravel auprès d\'Eureka Server';

    public function handle(EurekaClientService $eureka): int
    {
        $this->info(sprintf('Tentative d\'enregistrement auprès d\'Eureka [%s]...', $eureka->getServerUrl()));
        $this->line(sprintf('Service : <comment>%s</comment> | Instance : <comment>%s</comment>', $eureka->getAppName(), $eureka->getInstanceId()));

        $result = $eureka->register();

        if ($result['success']) {
            $this->info('[OK] ' . $result['message']);
            return Command::SUCCESS;
        }

        $this->error('[ERREUR] ' . $result['message']);
        return Command::FAILURE;
    }
}
