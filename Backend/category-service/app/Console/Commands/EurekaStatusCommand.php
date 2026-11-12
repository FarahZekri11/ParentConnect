<?php

namespace App\Console\Commands;

use App\Services\EurekaClientService;
use Illuminate\Console\Command;

class EurekaStatusCommand extends Command
{
    protected $signature = 'eureka:status';
    protected $description = 'Vérifie l\'état d\'enregistrement de l\'instance dans Eureka Server';

    public function handle(EurekaClientService $eureka): int
    {
        $this->info(sprintf('Interrogation du serveur Eureka [%s]...', $eureka->getServerUrl()));

        $result = $eureka->queryStatus();

        if ($result['registered']) {
            $this->info('[OK] Instance active et trouvée dans Eureka :');
            $this->line(json_encode($result['details'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return Command::SUCCESS;
        }

        $this->error(sprintf('[NON ENREGISTRÉ] Code HTTP %d : %s', $result['status_code'], is_string($result['details']) ? $result['details'] : json_encode($result['details'])));
        return Command::FAILURE;
    }
}
