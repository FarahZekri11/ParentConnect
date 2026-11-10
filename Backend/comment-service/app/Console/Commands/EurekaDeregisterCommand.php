<?php

namespace App\Console\Commands;

use App\Services\EurekaClientService;
use Illuminate\Console\Command;

class EurekaDeregisterCommand extends Command
{
    protected $signature = 'eureka:deregister';
    protected $description = 'Déréférence l\'instance courante d\'Eureka Server';

    public function handle(EurekaClientService $eureka): int
    {
        $this->info(sprintf('Déréférencement de l\'instance [%s] auprès d\'Eureka...', $eureka->getInstanceId()));

        $result = $eureka->deregister();

        if ($result['success']) {
            $this->info('[OK] ' . $result['message']);
            return Command::SUCCESS;
        }

        $this->warn('[ATTENTION] ' . $result['message']);
        return Command::FAILURE;
    }
}
